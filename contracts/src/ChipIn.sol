// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @notice The subset of the ERC-20 interface that Chip In uses on Arc's USDC
///         interface at 0x3600000000000000000000000000000000000000 (6 decimals).
interface IERC20 {
    function decimals() external view returns (uint8);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title Chip In
/// @notice Split a group bill in USDC on Arc. One contract, no owner, no admin,
///         no pause, no upgrade, no fee. Every amount in this contract is in
///         6-decimal USDC units (the ERC-20 interface), never 18-decimal
///         native units. The contract never reads or sends native value.
contract ChipIn {
    // ------------------------------------------------------------------
    // Types
    // ------------------------------------------------------------------

    /// @dev Open: accepting payments. Funded: fully covered, payee may be
    ///      paid. Released: payee has been paid. Expired: deadline passed
    ///      before the bill was covered; contributors may take refunds.
    enum State {
        Open,
        Funded,
        Released,
        Expired
    }

    /// @dev payer == address(0) means an open share: the first address that
    ///      pays it becomes its payer.
    struct Share {
        address payer;
        uint256 amount;
        bool paid;
    }

    struct Bill {
        address creator;
        address payee;
        uint64 deadline; // unix seconds. pay while block.timestamp < deadline
        uint256 total; // sum of share amounts, 6-decimal units
        uint256 paid; // amount currently held for this bill
        bool funded; // paid reached total
        bool released; // total sent to payee
        uint256 shareCount;
    }

    /// @dev Read-only snapshot returned by getBill.
    struct BillView {
        address creator;
        address payee;
        uint64 deadline;
        uint256 total;
        uint256 paid;
        uint256 shareCount;
        State state;
    }

    // ------------------------------------------------------------------
    // Configuration: constants and deploy-time immutables. No setters.
    // ------------------------------------------------------------------

    /// @notice Arc's ERC-20 interface for USDC. Same address on Arc mainnet
    ///         (5042) and Arc testnet (5042002).
    IERC20 public constant USDC = IERC20(0x3600000000000000000000000000000000000000);

    /// @notice Upper bound on the number of shares in one bill.
    uint256 public constant MAX_SHARES = 32;

    /// @notice Per-bill cap in 6-decimal USDC units, fixed at deploy time.
    uint256 public immutable maxBillAmount;

    /// @notice Longest allowed time from creation to deadline, in seconds,
    ///         fixed at deploy time.
    uint64 public immutable maxBillDuration;

    // ------------------------------------------------------------------
    // Storage
    // ------------------------------------------------------------------

    uint256 public billCount;
    mapping(uint256 billId => Bill) private _bills;
    mapping(uint256 billId => Share[]) private _shares;

    /// @notice Amount an address has paid into a bill and not yet been
    ///         refunded. Refunds pay out exactly this value.
    mapping(uint256 billId => mapping(address payer => uint256)) public contributed;

    uint256 private _lock = 1;

    // ------------------------------------------------------------------
    // Events: one for every step
    // ------------------------------------------------------------------

    event BillCreated(
        uint256 indexed billId,
        address indexed creator,
        address indexed payee,
        uint256 total,
        uint64 deadline,
        uint256 shareCount
    );
    event SharePaid(
        uint256 indexed billId, uint256 indexed shareIndex, address indexed payer, uint256 amount, uint256 paidTotal
    );
    event BillFunded(uint256 indexed billId, uint256 total);
    event Released(uint256 indexed billId, address indexed payee, uint256 amount);
    event Refunded(uint256 indexed billId, address indexed payer, uint256 amount);

    // ------------------------------------------------------------------
    // Errors
    // ------------------------------------------------------------------

    error BadConfig();
    error ZeroAddress();
    error NoShares();
    error TooManyShares(uint256 given, uint256 max);
    error LengthMismatch();
    error ZeroShare(uint256 index);
    error OverCap(uint256 total, uint256 cap);
    error DeadlineNotInFuture();
    error DeadlineTooFar(uint64 deadline, uint64 latestAllowed);
    error UnknownBill(uint256 billId);
    error UnknownShare(uint256 billId, uint256 shareIndex);
    error BillNotOpen(uint256 billId);
    error BillExpired(uint256 billId);
    error NotYourShare(uint256 billId, uint256 shareIndex);
    error SharePaidAlready(uint256 billId, uint256 shareIndex);
    error NotFunded(uint256 billId);
    error AlreadyReleased(uint256 billId);
    error NotRefundable(uint256 billId);
    error NothingToRefund(uint256 billId, address payer);
    error TransferFailed();
    error Reentrancy();

    // ------------------------------------------------------------------
    // Modifiers
    // ------------------------------------------------------------------

    modifier nonReentrant() {
        _enter();
        _;
        _lock = 1;
    }

    modifier exists(uint256 billId) {
        _exists(billId);
        _;
    }

    function _enter() private {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
    }

    function _exists(uint256 billId) private view {
        if (billId == 0 || billId > billCount) revert UnknownBill(billId);
    }

    // ------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------

    /// @param maxBillAmount_ per-bill cap in 6-decimal USDC units (25 USDC = 25000000)
    /// @param maxBillDuration_ longest creation-to-deadline span in seconds (30 days = 2592000)
    constructor(uint256 maxBillAmount_, uint64 maxBillDuration_) {
        if (maxBillAmount_ == 0 || maxBillDuration_ == 0) revert BadConfig();
        // Refuse to deploy anywhere the USDC interface is not Arc's 6-decimal one.
        if (USDC.decimals() != 6) revert BadConfig();
        maxBillAmount = maxBillAmount_;
        maxBillDuration = maxBillDuration_;
    }

    // ------------------------------------------------------------------
    // Writes
    // ------------------------------------------------------------------

    /// @notice Create a bill. Shares are listed as parallel arrays. A payer of
    ///         address(0) is an open share that anyone may pay. The total is
    ///         the sum of the amounts.
    function createBill(address payee, uint64 deadline, address[] calldata payers, uint256[] calldata amounts)
        external
        returns (uint256 billId)
    {
        if (payee == address(0)) revert ZeroAddress();
        uint256 n = amounts.length;
        if (n == 0) revert NoShares();
        if (n > MAX_SHARES) revert TooManyShares(n, MAX_SHARES);
        if (payers.length != n) revert LengthMismatch();
        if (deadline <= block.timestamp) revert DeadlineNotInFuture();
        uint64 latest = uint64(block.timestamp) + maxBillDuration;
        if (deadline > latest) revert DeadlineTooFar(deadline, latest);

        uint256 total;
        for (uint256 i = 0; i < n; i++) {
            if (amounts[i] == 0) revert ZeroShare(i);
            total += amounts[i];
        }
        if (total > maxBillAmount) revert OverCap(total, maxBillAmount);

        billId = ++billCount;
        Bill storage b = _bills[billId];
        b.creator = msg.sender;
        b.payee = payee;
        b.deadline = deadline;
        b.total = total;
        b.shareCount = n;

        Share[] storage s = _shares[billId];
        for (uint256 i = 0; i < n; i++) {
            s.push(Share({payer: payers[i], amount: amounts[i], paid: false}));
        }

        emit BillCreated(billId, msg.sender, payee, total, deadline, n);
    }

    /// @notice Pay one share of a bill. Pulls exactly the share amount with
    ///         transferFrom, so the caller must have approved at least that
    ///         amount to this contract first.
    function pay(uint256 billId, uint256 shareIndex) external nonReentrant exists(billId) {
        Bill storage b = _bills[billId];
        if (b.funded) revert BillNotOpen(billId);
        if (block.timestamp >= b.deadline) revert BillExpired(billId);
        if (shareIndex >= b.shareCount) revert UnknownShare(billId, shareIndex);

        Share storage s = _shares[billId][shareIndex];
        if (s.paid) revert SharePaidAlready(billId, shareIndex);
        if (s.payer == address(0)) {
            s.payer = msg.sender;
        } else if (s.payer != msg.sender) {
            revert NotYourShare(billId, shareIndex);
        }

        // Effects before the token call.
        uint256 amount = s.amount;
        s.paid = true;
        b.paid += amount;
        contributed[billId][msg.sender] += amount;
        bool nowFunded = b.paid == b.total;
        if (nowFunded) b.funded = true;

        // Interaction: pull the share from the payer.
        _callToken(abi.encodeCall(IERC20.transferFrom, (msg.sender, address(this), amount)));

        emit SharePaid(billId, shareIndex, msg.sender, amount, b.paid);
        if (nowFunded) emit BillFunded(billId, b.total);
    }

    /// @notice Send a fully covered bill's total to its payee. Anyone may call;
    ///         the destination is always the payee set at creation.
    function release(uint256 billId) external nonReentrant exists(billId) {
        Bill storage b = _bills[billId];
        if (!b.funded) revert NotFunded(billId);
        if (b.released) revert AlreadyReleased(billId);

        b.released = true;
        uint256 amount = b.total;

        _callToken(abi.encodeCall(IERC20.transfer, (b.payee, amount)));

        emit Released(billId, b.payee, amount);
    }

    /// @notice Take back everything the caller paid into a bill that reached
    ///         its deadline without being covered. Each contributor claims
    ///         their own refund, so one failing address blocks no one else.
    function refund(uint256 billId) external nonReentrant exists(billId) {
        Bill storage b = _bills[billId];
        if (b.funded || block.timestamp < b.deadline) revert NotRefundable(billId);

        uint256 amount = contributed[billId][msg.sender];
        if (amount == 0) revert NothingToRefund(billId, msg.sender);

        contributed[billId][msg.sender] = 0;
        b.paid -= amount;

        _callToken(abi.encodeCall(IERC20.transfer, (msg.sender, amount)));

        emit Refunded(billId, msg.sender, amount);
    }

    // ------------------------------------------------------------------
    // Reads
    // ------------------------------------------------------------------

    function stateOf(uint256 billId) public view exists(billId) returns (State) {
        Bill storage b = _bills[billId];
        if (b.released) return State.Released;
        if (b.funded) return State.Funded;
        if (block.timestamp >= b.deadline) return State.Expired;
        return State.Open;
    }

    function getBill(uint256 billId) external view exists(billId) returns (BillView memory v) {
        Bill storage b = _bills[billId];
        v.creator = b.creator;
        v.payee = b.payee;
        v.deadline = b.deadline;
        v.total = b.total;
        v.paid = b.paid;
        v.shareCount = b.shareCount;
        v.state = stateOf(billId);
    }

    function getShare(uint256 billId, uint256 shareIndex)
        external
        view
        exists(billId)
        returns (address payer, uint256 amount, bool paid)
    {
        if (shareIndex >= _bills[billId].shareCount) revert UnknownShare(billId, shareIndex);
        Share storage s = _shares[billId][shareIndex];
        return (s.payer, s.amount, s.paid);
    }

    function getShares(uint256 billId) external view exists(billId) returns (Share[] memory) {
        return _shares[billId];
    }

    /// @notice Amount currently held by this contract for a bill (zero once
    ///         released). The contract's USDC balance is always at least the
    ///         sum of this value over all bills.
    function held(uint256 billId) external view exists(billId) returns (uint256) {
        Bill storage b = _bills[billId];
        return b.released ? 0 : b.paid;
    }

    // ------------------------------------------------------------------
    // Internal
    // ------------------------------------------------------------------

    /// @dev Calls USDC, bubbles up the token's own revert reason (for example
    ///      a blocklist revert), and treats a returned `false` as failure.
    function _callToken(bytes memory data) private {
        (bool ok, bytes memory ret) = address(USDC).call(data);
        if (!ok) {
            if (ret.length == 0) revert TransferFailed();
            assembly ("memory-safe") {
                revert(add(ret, 0x20), mload(ret))
            }
        }
        if (ret.length != 0 && !abi.decode(ret, (bool))) revert TransferFailed();
    }
}
