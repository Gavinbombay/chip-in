// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @notice Stand-in for Arc's 6-decimal USDC interface, used ONLY when the test
///         EVM has no code at 0x3600000000000000000000000000000000000000 (a
///         standard EVM). Under Arc Foundry (`--network arc` or a fork of an
///         Arc network) the real interface is present and this mock is never
///         installed. It has no constructor so that `vm.etch` of its runtime
///         code is enough. It mimics the Arc rules the contract cares about:
///         zero-address and blocklist reverts.
contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public blocked;

    // Optional re-entrancy hook: when set, every transfer calls `target` with
    // `data` before moving the balance and bubbles any revert.
    address public reenterTarget;
    bytes public reenterData;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function name() external pure returns (string memory) {
        return "Mock USDC";
    }

    function symbol() external pure returns (string memory) {
        return "USDC";
    }

    function decimals() external pure returns (uint8) {
        return 6;
    }

    // ---- test controls

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function setBlocked(address account, bool isBlocked) external {
        blocked[account] = isBlocked;
    }

    function setReenter(address target, bytes calldata data) external {
        reenterTarget = target;
        reenterData = data;
    }

    // ---- ERC-20

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "ERC20: insufficient allowance");
        allowance[from][msg.sender] = a - amount;
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) private {
        require(to != address(0), "Zero address not allowed");
        require(!blocked[from] && !blocked[to], "Blocklisted address");
        if (reenterTarget != address(0)) {
            (bool ok, bytes memory ret) = reenterTarget.call(reenterData);
            if (!ok) {
                assembly ("memory-safe") {
                    revert(add(ret, 0x20), mload(ret))
                }
            }
        }
        require(balanceOf[from] >= amount, "ERC20: transfer amount exceeds balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
