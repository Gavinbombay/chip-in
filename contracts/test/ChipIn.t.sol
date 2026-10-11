// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {ChipIn, IERC20} from "../src/ChipIn.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// @notice Shared fixture. Under Arc Foundry the real USDC interface exists at
///         0x36 and `mock` stays false. On a standard EVM (no code at 0x36) a
///         MockUSDC is etched there so the logic can still be exercised.
abstract contract ChipInTestBase is Test {
    IERC20 constant USDC = IERC20(0x3600000000000000000000000000000000000000);

    uint256 constant CAP = 25_000_000; // 25 USDC, 6 decimals
    uint64 constant DURATION = 30 days;
    uint256 constant USDC_1 = 1_000_000;

    // Documented blocklisted test address on Arc Testnet (mnemonic index 1).
    address constant BLOCKED = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    ChipIn chipIn;
    bool mock;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address payee = makeAddr("payee");
    address stranger = makeAddr("stranger");

    function setUp() public virtual {
        if (address(USDC).code.length == 0) {
            MockUSDC impl = new MockUSDC();
            vm.etch(address(USDC), address(impl).code);
            mock = true;
        }
        chipIn = new ChipIn(CAP, DURATION);
        _fund(alice, 100 * USDC_1);
        _fund(bob, 100 * USDC_1);
        _fund(carol, 100 * USDC_1);
        _fund(stranger, 100 * USDC_1);
        _setBlocked(BLOCKED);
    }

    // ---- helpers

    function _fund(address who, uint256 amount6) internal {
        if (mock) {
            MockUSDC(address(USDC)).mint(who, amount6);
        } else {
            vm.deal(who, who.balance + amount6 * 1e12);
        }
    }

    function _setBlocked(address who) internal {
        if (mock) MockUSDC(address(USDC)).setBlocked(who, true);
        // On Arc the chain enforces its own blocklist; BLOCKED is seeded on testnet.
    }

    function _bal(address who) internal view returns (uint256) {
        return USDC.balanceOf(who);
    }

    function _approve(address who, uint256 amount) internal {
        vm.prank(who);
        USDC.approve(address(chipIn), amount);
    }

    function _approveAndPay(address who, uint256 billId, uint256 idx) internal {
        (, uint256 amount,) = chipIn.getShare(billId, idx);
        _approve(who, amount);
        vm.prank(who);
        chipIn.pay(billId, idx);
    }

    function _deadline() internal view returns (uint64) {
        return uint64(block.timestamp + 1 days);
    }

    /// @dev Mirrors the page's equal split: remainder goes to the first shares.
    function _splitEqual(uint256 total, uint256 n) internal pure returns (uint256[] memory out) {
        out = new uint256[](n);
        uint256 base = total / n;
        uint256 rem = total % n;
        for (uint256 i = 0; i < n; i++) {
            out[i] = base + (i < rem ? 1 : 0);
        }
    }

    function _zeros(uint256 n) internal pure returns (address[] memory out) {
        out = new address[](n);
    }

    function _two(address a, address b) internal pure returns (address[] memory out) {
        out = new address[](2);
        out[0] = a;
        out[1] = b;
    }

    function _two(uint256 a, uint256 b) internal pure returns (uint256[] memory out) {
        out = new uint256[](2);
        out[0] = a;
        out[1] = b;
    }

    /// @dev alice 10 USDC + bob 5 USDC, payee `payee`, deadline in one day.
    function _createListedBill() internal returns (uint256 billId) {
        vm.prank(carol);
        billId = chipIn.createBill(payee, _deadline(), _two(alice, bob), _two(10 * USDC_1, 5 * USDC_1));
    }

    /// @dev n open shares splitting `total`.
    function _createOpenBill(uint256 total, uint256 n) internal returns (uint256 billId) {
        vm.prank(carol);
        billId = chipIn.createBill(payee, _deadline(), _zeros(n), _splitEqual(total, n));
    }

    function _held(uint256 billId) internal view returns (uint256) {
        return chipIn.held(billId);
    }

    function _state(uint256 billId) internal view returns (ChipIn.State) {
        return chipIn.stateOf(billId);
    }
}

// =====================================================================
// Probe (runs in both modes)
// =====================================================================
contract ChipInProbeTest is ChipInTestBase {
    function test_Probe_UsdcDecimalsIs6() public view {
        assertEq(USDC.decimals(), 6);
    }

    function test_Probe_FundingReflectsInErc20Balance() public {
        address a = makeAddr("fresh");
        _fund(a, 5 * USDC_1);
        assertEq(_bal(a), 5 * USDC_1);
    }
}

// =====================================================================
// Constructor
// =====================================================================
contract ChipInConstructorTest is ChipInTestBase {
    function test_Constructor_SetsImmutables() public view {
        assertEq(chipIn.maxBillAmount(), CAP);
        assertEq(chipIn.maxBillDuration(), DURATION);
        assertEq(chipIn.MAX_SHARES(), 32);
        assertEq(address(chipIn.USDC()), address(USDC));
        assertEq(chipIn.billCount(), 0);
    }

    function test_Constructor_RevertsOnZeroCap() public {
        vm.expectRevert(ChipIn.BadConfig.selector);
        new ChipIn(0, DURATION);
    }

    function test_Constructor_RevertsOnZeroDuration() public {
        vm.expectRevert(ChipIn.BadConfig.selector);
        new ChipIn(CAP, 0);
    }

    function test_Constructor_RevertsWhenUsdcHasNoCode() public {
        // A chain where 0x36 is empty (standard EVM without the mock) must refuse the deploy.
        vm.skip(!mock);
        bytes memory saved = address(USDC).code;
        vm.etch(address(USDC), "");
        vm.expectRevert();
        new ChipIn(CAP, DURATION);
        vm.etch(address(USDC), saved);
    }
}

// =====================================================================
// createBill
// =====================================================================
contract ChipInCreateBillTest is ChipInTestBase {
    function test_CreateBill_StoresFieldsAndEmits() public {
        uint64 dl = _deadline();
        vm.expectEmit(true, true, true, true);
        emit ChipIn.BillCreated(1, carol, payee, 15 * USDC_1, dl, 2);
        vm.prank(carol);
        uint256 id = chipIn.createBill(payee, dl, _two(alice, bob), _two(10 * USDC_1, 5 * USDC_1));
        assertEq(id, 1);
        assertEq(chipIn.billCount(), 1);

        ChipIn.BillView memory v = chipIn.getBill(1);
        assertEq(v.creator, carol);
        assertEq(v.payee, payee);
        assertEq(v.deadline, dl);
        assertEq(v.total, 15 * USDC_1);
        assertEq(v.paid, 0);
        assertEq(v.shareCount, 2);
        assertEq(uint8(v.state), uint8(ChipIn.State.Open));

        ChipIn.Share[] memory s = chipIn.getShares(1);
        assertEq(s.length, 2);
        assertEq(s[0].payer, alice);
        assertEq(s[0].amount, 10 * USDC_1);
        assertFalse(s[0].paid);
        assertEq(s[1].payer, bob);
        assertEq(s[1].amount, 5 * USDC_1);
        assertFalse(s[1].paid);
        assertEq(_held(1), 0);
    }

    function test_CreateBill_OpenSharesAllowed() public {
        uint256 id = _createOpenBill(3 * USDC_1, 3);
        ChipIn.Share[] memory s = chipIn.getShares(id);
        for (uint256 i = 0; i < 3; i++) {
            assertEq(s[i].payer, address(0));
            assertEq(s[i].amount, USDC_1);
        }
    }

    function test_CreateBill_RevertsOnZeroPayee() public {
        vm.expectRevert(ChipIn.ZeroAddress.selector);
        chipIn.createBill(address(0), _deadline(), _zeros(1), _splitEqual(USDC_1, 1));
    }

    function test_CreateBill_RevertsOnNoShares() public {
        vm.expectRevert(ChipIn.NoShares.selector);
        chipIn.createBill(payee, _deadline(), new address[](0), new uint256[](0));
    }

    function test_CreateBill_RevertsOnTooManyShares() public {
        vm.expectRevert(abi.encodeWithSelector(ChipIn.TooManyShares.selector, 33, 32));
        chipIn.createBill(payee, _deadline(), _zeros(33), _splitEqual(33 * USDC_1, 33));
    }

    function test_CreateBill_AllowsMaxShares() public {
        uint256 id = chipIn.createBill(payee, _deadline(), _zeros(32), _splitEqual(CAP, 32));
        assertEq(chipIn.getShares(id).length, 32);
    }

    function test_CreateBill_RevertsOnLengthMismatch() public {
        vm.expectRevert(ChipIn.LengthMismatch.selector);
        chipIn.createBill(payee, _deadline(), _zeros(1), _splitEqual(2 * USDC_1, 2));
    }

    function test_CreateBill_RevertsOnZeroShare() public {
        vm.expectRevert(abi.encodeWithSelector(ChipIn.ZeroShare.selector, 1));
        chipIn.createBill(payee, _deadline(), _zeros(2), _two(USDC_1, 0));
    }

    function test_CreateBill_RevertsOverCap() public {
        vm.expectRevert(abi.encodeWithSelector(ChipIn.OverCap.selector, CAP + 1, CAP));
        chipIn.createBill(payee, _deadline(), _zeros(2), _two(CAP, 1));
    }

    function test_CreateBill_AllowsExactlyCap() public {
        uint256 id = chipIn.createBill(payee, _deadline(), _zeros(1), _splitEqual(CAP, 1));
        uint256 total = chipIn.getBill(id).total;
        assertEq(total, CAP);
    }

    function test_CreateBill_RevertsOnDeadlineNow() public {
        vm.expectRevert(ChipIn.DeadlineNotInFuture.selector);
        chipIn.createBill(payee, uint64(block.timestamp), _zeros(1), _splitEqual(USDC_1, 1));
    }

    function test_CreateBill_RevertsOnDeadlinePast() public {
        vm.warp(1_000_000);
        vm.expectRevert(ChipIn.DeadlineNotInFuture.selector);
        chipIn.createBill(payee, uint64(block.timestamp - 1), _zeros(1), _splitEqual(USDC_1, 1));
    }

    function test_CreateBill_RevertsOnDeadlineTooFar() public {
        uint64 latest = uint64(block.timestamp) + DURATION;
        vm.expectRevert(abi.encodeWithSelector(ChipIn.DeadlineTooFar.selector, latest + 1, latest));
        chipIn.createBill(payee, latest + 1, _zeros(1), _splitEqual(USDC_1, 1));
    }

    function test_CreateBill_AllowsDeadlineAtMaxDuration() public {
        uint64 latest = uint64(block.timestamp) + DURATION;
        uint256 id = chipIn.createBill(payee, latest, _zeros(1), _splitEqual(USDC_1, 1));
        uint64 d = chipIn.getBill(id).deadline;
        assertEq(d, latest);
    }

    function test_CreateBill_IdsAreSequentialFromOne() public {
        assertEq(_createOpenBill(USDC_1, 1), 1);
        assertEq(_createOpenBill(USDC_1, 1), 2);
        assertEq(_createOpenBill(USDC_1, 1), 3);
        assertEq(chipIn.billCount(), 3);
    }

    function test_CreateBill_PayeeMayAlsoBeAPayer() public {
        vm.prank(payee);
        uint256 id = chipIn.createBill(payee, _deadline(), _two(payee, alice), _two(USDC_1, USDC_1));
        assertEq(id, 1);
    }

    function test_NoFunctionAcceptsNativeValue() public {
        vm.deal(address(this), 1 ether);
        uint256 id = _createOpenBill(USDC_1, 1);
        bool ok;
        (ok,) = address(chipIn).call{value: 1}("");
        assertFalse(ok, "plain value send must fail: no receive()");
        (ok,) = address(chipIn).call{value: 1}(abi.encodeCall(ChipIn.pay, (id, 0)));
        assertFalse(ok, "pay is not payable");
        (ok,) = address(chipIn).call{value: 1}(abi.encodeCall(ChipIn.release, (id)));
        assertFalse(ok, "release is not payable");
        (ok,) = address(chipIn).call{value: 1}(abi.encodeCall(ChipIn.refund, (id)));
        assertFalse(ok, "refund is not payable");
        (ok,) = address(chipIn).call{value: 1}(
            abi.encodeCall(ChipIn.createBill, (payee, _deadline(), _zeros(1), _splitEqual(USDC_1, 1)))
        );
        assertFalse(ok, "createBill is not payable");
    }
}

// =====================================================================
// pay
// =====================================================================
contract ChipInPayTest is ChipInTestBase {
    function test_Pay_AssignedSharePullsExactAmountAndEmits() public {
        uint256 id = _createListedBill();
        uint256 before = _bal(alice);
        _approve(alice, 10 * USDC_1);
        vm.expectEmit(true, true, true, true);
        emit ChipIn.SharePaid(id, 0, alice, 10 * USDC_1, 10 * USDC_1);
        vm.prank(alice);
        chipIn.pay(id, 0);
        assertEq(before - _bal(alice), 10 * USDC_1);
        assertEq(_bal(address(chipIn)), 10 * USDC_1);
        assertEq(chipIn.contributed(id, alice), 10 * USDC_1);
        (address payer, uint256 amount, bool paid) = chipIn.getShare(id, 0);
        assertEq(payer, alice);
        assertEq(amount, 10 * USDC_1);
        assertTrue(paid);
        ChipIn.BillView memory v = chipIn.getBill(id);
        assertEq(v.paid, 10 * USDC_1);
        assertEq(uint8(v.state), uint8(ChipIn.State.Open));
        assertEq(_held(id), 10 * USDC_1);
    }

    function test_Pay_OpenShareAssignsPayer() public {
        uint256 id = _createOpenBill(2 * USDC_1, 2);
        _approveAndPay(stranger, id, 1);
        (address payer,, bool paid) = chipIn.getShare(id, 1);
        assertEq(payer, stranger);
        assertTrue(paid);
        (address payer0,, bool paid0) = chipIn.getShare(id, 0);
        assertEq(payer0, address(0));
        assertFalse(paid0);
    }

    function test_Pay_RevertsNotYourShare() public {
        uint256 id = _createListedBill();
        _approve(bob, 10 * USDC_1);
        vm.expectRevert(abi.encodeWithSelector(ChipIn.NotYourShare.selector, id, 0));
        vm.prank(bob);
        chipIn.pay(id, 0);
    }

    function test_Pay_RevertsDoublePaySameShare() public {
        uint256 id = _createListedBill();
        _approveAndPay(alice, id, 0);
        _approve(alice, 10 * USDC_1);
        vm.expectRevert(abi.encodeWithSelector(ChipIn.SharePaidAlready.selector, id, 0));
        vm.prank(alice);
        chipIn.pay(id, 0);
        assertEq(chipIn.contributed(id, alice), 10 * USDC_1, "double pay must not change contribution");
    }

    function test_Pay_RevertsSecondTakerOfOpenShare() public {
        uint256 id = _createOpenBill(2 * USDC_1, 2);
        _approveAndPay(alice, id, 0);
        _approve(bob, USDC_1);
        vm.expectRevert(abi.encodeWithSelector(ChipIn.SharePaidAlready.selector, id, 0));
        vm.prank(bob);
        chipIn.pay(id, 0);
    }

    function test_Pay_RevertsWhenBillFunded() public {
        // Overpay: paying into an already covered bill is rejected before any transfer.
        uint256 id = _createListedBill();
        _approveAndPay(alice, id, 0);
        _approveAndPay(bob, id, 1);
        assertEq(uint8(_state(id)), uint8(ChipIn.State.Funded));
        _approve(stranger, USDC_1);
        vm.expectRevert(abi.encodeWithSelector(ChipIn.BillNotOpen.selector, id));
        vm.prank(stranger);
        chipIn.pay(id, 0);
        uint256 paid = chipIn.getBill(id).paid;
        assertEq(paid, 15 * USDC_1, "paid must never exceed total");
    }

    function test_Pay_ExcessAllowanceOnlyPullsShare() public {
        uint256 id = _createListedBill();
        uint256 before = _bal(alice);
        _approve(alice, 20 * USDC_1); // twice the share
        vm.prank(alice);
        chipIn.pay(id, 0);
        assertEq(before - _bal(alice), 10 * USDC_1, "only the share is pulled");
        assertEq(USDC.allowance(alice, address(chipIn)), 10 * USDC_1, "leftover allowance stays with the payer");
    }

    function test_Pay_RevertsWithoutAllowance() public {
        uint256 id = _createListedBill();
        vm.expectRevert();
        vm.prank(alice);
        chipIn.pay(id, 0);
        assertEq(chipIn.contributed(id, alice), 0);
        assertEq(_held(id), 0);
    }

    function test_Pay_RevertsWithInsufficientBalance() public {
        address poor = makeAddr("poor");
        vm.prank(carol);
        uint256 id = chipIn.createBill(payee, _deadline(), _two(poor, bob), _two(USDC_1, USDC_1));
        _approve(poor, USDC_1);
        vm.expectRevert();
        vm.prank(poor);
        chipIn.pay(id, 0);
        (,, bool paid) = chipIn.getShare(id, 0);
        assertFalse(paid, "state must roll back with the failed transfer");
    }

    function test_Pay_RevertsOnUnknownBill() public {
        vm.expectRevert(abi.encodeWithSelector(ChipIn.UnknownBill.selector, 0));
        chipIn.pay(0, 0);
        uint256 id = _createListedBill();
        vm.expectRevert(abi.encodeWithSelector(ChipIn.UnknownBill.selector, id + 1));
        chipIn.pay(id + 1, 0);
    }

    function test_Pay_RevertsOnUnknownShare() public {
        uint256 id = _createListedBill();
        vm.expectRevert(abi.encodeWithSelector(ChipIn.UnknownShare.selector, id, 2));
        vm.prank(alice);
        chipIn.pay(id, 2);
    }

    function test_Pay_RevertsAtDeadline() public {
        uint256 id = _createListedBill();
        uint64 dl = chipIn.getBill(id).deadline;
        _approve(alice, 10 * USDC_1);
        vm.warp(dl);
        vm.expectRevert(abi.encodeWithSelector(ChipIn.BillExpired.selector, id));
        vm.prank(alice);
        chipIn.pay(id, 0);
    }

    function test_Pay_SucceedsOneSecondBeforeDeadline() public {
        uint256 id = _createListedBill();
        uint64 dl = chipIn.getBill(id).deadline;
        vm.warp(dl - 1);
        _approveAndPay(alice, id, 0);
        assertEq(chipIn.contributed(id, alice), 10 * USDC_1);
    }

    function test_Pay_LastShareMarksFundedAndEmits() public {
        uint256 id = _createListedBill();
        _approveAndPay(alice, id, 0);
        _approve(bob, 5 * USDC_1);
        vm.expectEmit(true, true, true, true);
        emit ChipIn.SharePaid(id, 1, bob, 5 * USDC_1, 15 * USDC_1);
        vm.expectEmit(true, true, true, true);
        emit ChipIn.BillFunded(id, 15 * USDC_1);
        vm.prank(bob);
        chipIn.pay(id, 1);
        assertEq(uint8(_state(id)), uint8(ChipIn.State.Funded));
        assertEq(_held(id), 15 * USDC_1);
    }

    function test_Pay_SamePayerCanPayTwoDifferentShares() public {
        uint256 id = _createOpenBill(3 * USDC_1, 3);
        _approveAndPay(alice, id, 0);
        _approveAndPay(alice, id, 2);
        assertEq(chipIn.contributed(id, alice), 2 * USDC_1);
        uint256 paid = chipIn.getBill(id).paid;
        assertEq(paid, 2 * USDC_1);
    }

    function test_Pay_Blocklist_RevertsForBlockedPayer() public {
        _fund(BLOCKED, 10 * USDC_1);
        vm.prank(carol);
        uint256 id = chipIn.createBill(payee, _deadline(), _two(BLOCKED, bob), _two(USDC_1, USDC_1));
        _approve(BLOCKED, USDC_1);
        vm.expectRevert();
        vm.prank(BLOCKED);
        chipIn.pay(id, 0);
        (,, bool paid) = chipIn.getShare(id, 0);
        assertFalse(paid);
        assertEq(_held(id), 0);
        // The other payer is unaffected.
        _approveAndPay(bob, id, 1);
        assertEq(chipIn.contributed(id, bob), USDC_1);
    }
}

// =====================================================================
// release
// =====================================================================
contract ChipInReleaseTest is ChipInTestBase {
    function _fundedListedBill() internal returns (uint256 id) {
        id = _createListedBill();
        _approveAndPay(alice, id, 0);
        _approveAndPay(bob, id, 1);
    }

    function test_Release_SendsTotalToPayeeAndEmits() public {
        uint256 id = _fundedListedBill();
        uint256 before = _bal(payee);
        vm.expectEmit(true, true, true, true);
        emit ChipIn.Released(id, payee, 15 * USDC_1);
        vm.prank(payee);
        chipIn.release(id);
        assertEq(_bal(payee) - before, 15 * USDC_1);
        assertEq(_bal(address(chipIn)), 0);
        assertEq(_held(id), 0);
        assertEq(uint8(_state(id)), uint8(ChipIn.State.Released));
    }

    function test_Release_AnyoneCanCall_FundsStillGoToPayee() public {
        uint256 id = _fundedListedBill();
        uint256 beforePayee = _bal(payee);
        uint256 beforeStranger = _bal(stranger);
        vm.prank(stranger);
        chipIn.release(id);
        assertEq(_bal(payee) - beforePayee, 15 * USDC_1);
        assertEq(_bal(stranger), beforeStranger);
    }

    function test_Release_RevertsNotFunded() public {
        uint256 id = _createListedBill();
        _approveAndPay(alice, id, 0);
        vm.expectRevert(abi.encodeWithSelector(ChipIn.NotFunded.selector, id));
        chipIn.release(id);
    }

    function test_Release_RevertsAlreadyReleased() public {
        uint256 id = _fundedListedBill();
        chipIn.release(id);
        vm.expectRevert(abi.encodeWithSelector(ChipIn.AlreadyReleased.selector, id));
        chipIn.release(id);
    }

    function test_Release_AfterDeadlineStillWorks() public {
        uint256 id = _fundedListedBill();
        uint64 dl = chipIn.getBill(id).deadline;
        vm.warp(dl + 10 days);
        assertEq(uint8(_state(id)), uint8(ChipIn.State.Funded), "a funded bill never expires");
        chipIn.release(id);
        assertEq(uint8(_state(id)), uint8(ChipIn.State.Released));
    }

    function test_Release_RevertsOnUnknownBill() public {
        vm.expectRevert(abi.encodeWithSelector(ChipIn.UnknownBill.selector, 7));
        chipIn.release(7);
    }

    function test_Release_Blocklist_RevertsForBlockedPayee_FundsStayHeld() public {
        // Accepted limitation, documented in the design: a payee that cannot
        // receive USDC leaves the bill Funded. No other bill is affected.
        vm.prank(carol);
        uint256 id = chipIn.createBill(BLOCKED, _deadline(), _two(alice, bob), _two(USDC_1, USDC_1));
        _approveAndPay(alice, id, 0);
        _approveAndPay(bob, id, 1);
        vm.expectRevert();
        chipIn.release(id);
        assertEq(uint8(_state(id)), uint8(ChipIn.State.Funded));
        assertEq(_held(id), 2 * USDC_1);
        // Another bill is unaffected.
        uint256 other = _createListedBill();
        _approveAndPay(alice, other, 0);
        _approveAndPay(bob, other, 1);
        chipIn.release(other);
        assertEq(uint8(_state(other)), uint8(ChipIn.State.Released));
    }
}

// =====================================================================
// refund
// =====================================================================
contract ChipInRefundTest is ChipInTestBase {
    function _shortBill() internal returns (uint256 id, uint64 dl) {
        id = _createListedBill();
        dl = chipIn.getBill(id).deadline;
        _approveAndPay(alice, id, 0); // bob never pays
    }

    function test_Refund_AfterDeadlineReturnsContribution() public {
        (uint256 id, uint64 dl) = _shortBill();
        uint256 before = _bal(alice);
        vm.warp(dl + 1);
        vm.expectEmit(true, true, true, true);
        emit ChipIn.Refunded(id, alice, 10 * USDC_1);
        vm.prank(alice);
        chipIn.refund(id);
        assertEq(_bal(alice) - before, 10 * USDC_1);
        assertEq(chipIn.contributed(id, alice), 0);
        assertEq(_held(id), 0);
        assertEq(_bal(address(chipIn)), 0);
        assertEq(uint8(_state(id)), uint8(ChipIn.State.Expired));
    }

    function test_Refund_RevertsBeforeDeadline() public {
        (uint256 id, uint64 dl) = _shortBill();
        vm.warp(dl - 1);
        vm.expectRevert(abi.encodeWithSelector(ChipIn.NotRefundable.selector, id));
        vm.prank(alice);
        chipIn.refund(id);
    }

    function test_Refund_AtDeadlineExactlySucceeds() public {
        (uint256 id, uint64 dl) = _shortBill();
        vm.warp(dl);
        vm.prank(alice);
        chipIn.refund(id);
        assertEq(chipIn.contributed(id, alice), 0);
    }

    function test_Refund_RevertsWhenFunded() public {
        uint256 id = _createListedBill();
        uint64 dl = chipIn.getBill(id).deadline;
        _approveAndPay(alice, id, 0);
        _approveAndPay(bob, id, 1);
        vm.warp(dl + 1);
        vm.expectRevert(abi.encodeWithSelector(ChipIn.NotRefundable.selector, id));
        vm.prank(alice);
        chipIn.refund(id);
    }

    function test_Refund_RevertsNothingToRefund() public {
        (uint256 id, uint64 dl) = _shortBill();
        vm.warp(dl);
        vm.expectRevert(abi.encodeWithSelector(ChipIn.NothingToRefund.selector, id, bob));
        vm.prank(bob);
        chipIn.refund(id);
    }

    function test_Refund_RevertsSecondTime() public {
        (uint256 id, uint64 dl) = _shortBill();
        vm.warp(dl);
        vm.prank(alice);
        chipIn.refund(id);
        vm.expectRevert(abi.encodeWithSelector(ChipIn.NothingToRefund.selector, id, alice));
        vm.prank(alice);
        chipIn.refund(id);
    }

    function test_Refund_SumsMultipleSharesOfSamePayer() public {
        uint256 id = _createOpenBill(4 * USDC_1, 4);
        uint64 dl = chipIn.getBill(id).deadline;
        _approveAndPay(alice, id, 0);
        _approveAndPay(alice, id, 3);
        uint256 before = _bal(alice);
        vm.warp(dl);
        vm.prank(alice);
        chipIn.refund(id);
        assertEq(_bal(alice) - before, 2 * USDC_1);
    }

    function test_Refund_ReducesHeld() public {
        uint256 id = _createOpenBill(3 * USDC_1, 3);
        uint64 dl = chipIn.getBill(id).deadline;
        _approveAndPay(alice, id, 0);
        _approveAndPay(bob, id, 1);
        assertEq(_held(id), 2 * USDC_1);
        vm.warp(dl);
        vm.prank(alice);
        chipIn.refund(id);
        assertEq(_held(id), USDC_1);
        assertEq(_bal(address(chipIn)), USDC_1);
    }

    function test_Refund_RevertsOnUnknownBill() public {
        vm.expectRevert(abi.encodeWithSelector(ChipIn.UnknownBill.selector, 3));
        chipIn.refund(3);
    }

    function test_Refund_Blocklist_BlockedContributorDoesNotBlockOthers() public {
        // Three shares: BLOCKED, bob, alice. alice never pays, so the bill stays short.
        _fund(BLOCKED, 10 * USDC_1);
        address[] memory payers = new address[](3);
        payers[0] = BLOCKED;
        payers[1] = bob;
        payers[2] = alice;
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = USDC_1;
        amounts[1] = USDC_1;
        amounts[2] = USDC_1;
        vm.prank(carol);
        uint256 id = chipIn.createBill(payee, _deadline(), payers, amounts);
        uint64 dl = chipIn.getBill(id).deadline;

        if (mock) {
            // Let the mock pay in first, then block it, to simulate an address
            // that is blocklisted after it contributed.
            MockUSDC(address(USDC)).setBlocked(BLOCKED, false);
            _approveAndPay(BLOCKED, id, 0);
            MockUSDC(address(USDC)).setBlocked(BLOCKED, true);
        }
        _approveAndPay(bob, id, 1);

        vm.warp(dl);
        assertEq(uint8(_state(id)), uint8(ChipIn.State.Expired));
        if (mock) {
            vm.expectRevert();
            vm.prank(BLOCKED);
            chipIn.refund(id);
            assertEq(chipIn.contributed(id, BLOCKED), USDC_1, "blocked contributor keeps a claim");
        }
        uint256 before = _bal(bob);
        vm.prank(bob);
        chipIn.refund(id);
        assertEq(_bal(bob) - before, USDC_1, "other contributors refund normally");
        assertEq(chipIn.contributed(id, bob), 0);
    }
}

// =====================================================================
// State machine and deadline edges
// =====================================================================
contract ChipInStateTest is ChipInTestBase {
    function test_State_OpenFundedReleased() public {
        uint256 id = _createListedBill();
        assertEq(uint8(_state(id)), uint8(ChipIn.State.Open));
        _approveAndPay(alice, id, 0);
        assertEq(uint8(_state(id)), uint8(ChipIn.State.Open));
        _approveAndPay(bob, id, 1);
        assertEq(uint8(_state(id)), uint8(ChipIn.State.Funded));
        chipIn.release(id);
        assertEq(uint8(_state(id)), uint8(ChipIn.State.Released));
    }

    function test_State_ExpiredAtDeadline() public {
        uint256 id = _createListedBill();
        uint64 dl = chipIn.getBill(id).deadline;
        vm.warp(dl - 1);
        assertEq(uint8(_state(id)), uint8(ChipIn.State.Open));
        vm.warp(dl);
        assertEq(uint8(_state(id)), uint8(ChipIn.State.Expired));
    }

    function test_State_RevertsOnUnknownBill() public {
        vm.expectRevert(abi.encodeWithSelector(ChipIn.UnknownBill.selector, 1));
        chipIn.stateOf(1);
        vm.expectRevert(abi.encodeWithSelector(ChipIn.UnknownBill.selector, 1));
        chipIn.getBill(1);
        vm.expectRevert(abi.encodeWithSelector(ChipIn.UnknownBill.selector, 1));
        chipIn.getShares(1);
        vm.expectRevert(abi.encodeWithSelector(ChipIn.UnknownBill.selector, 1));
        chipIn.held(1);
    }

    function test_DeadlineEdge_PayAndRefundAreComplementary() public {
        // Arc block timestamps are non-decreasing: two blocks may share one
        // timestamp. At any single timestamp exactly one of pay / refund is
        // allowed for an uncovered bill, so a shared timestamp cannot allow both.
        uint256 id = _createOpenBill(2 * USDC_1, 2);
        uint64 dl = chipIn.getBill(id).deadline;
        _approveAndPay(alice, id, 0);

        vm.warp(dl - 1);
        vm.expectRevert(abi.encodeWithSelector(ChipIn.NotRefundable.selector, id));
        vm.prank(alice);
        chipIn.refund(id);
        _approve(bob, USDC_1); // bob could still pay now (not executed, keeps the bill short)

        vm.warp(dl);
        vm.expectRevert(abi.encodeWithSelector(ChipIn.BillExpired.selector, id));
        vm.prank(bob);
        chipIn.pay(id, 1);
        vm.prank(alice);
        chipIn.refund(id);
        assertEq(chipIn.contributed(id, alice), 0);
    }

    function test_Held_SumMatchesContractBalance() public {
        uint256 a = _createListedBill(); // 15
        uint256 b = _createOpenBill(3 * USDC_1, 3); // 3
        uint256 c = _createOpenBill(2 * USDC_1, 2); // 2
        _approveAndPay(alice, a, 0);
        _approveAndPay(bob, a, 1);
        _approveAndPay(alice, b, 0);
        _approveAndPay(carol, c, 0);
        _approveAndPay(stranger, c, 1);
        chipIn.release(c);
        uint64 dl = chipIn.getBill(b).deadline;
        vm.warp(dl);
        vm.prank(alice);
        chipIn.refund(b);
        uint256 sum = _held(a) + _held(b) + _held(c);
        assertEq(sum, 15 * USDC_1);
        assertEq(_bal(address(chipIn)), sum);
    }
}

// =====================================================================
// Reentrancy (mock-only: Arc's USDC interface cannot call back)
// =====================================================================
contract ChipInReentrancyTest is ChipInTestBase {
    function test_Reentrancy_ReleaseCannotReenter() public {
        vm.skip(!mock);
        uint256 id = _createListedBill();
        _approveAndPay(alice, id, 0);
        _approveAndPay(bob, id, 1);
        MockUSDC(address(USDC)).setReenter(address(chipIn), abi.encodeCall(ChipIn.release, (id)));
        vm.expectRevert(ChipIn.Reentrancy.selector);
        chipIn.release(id);
        assertEq(uint8(_state(id)), uint8(ChipIn.State.Funded), "state rolled back");
        MockUSDC(address(USDC)).setReenter(address(0), "");
        chipIn.release(id);
        assertEq(uint8(_state(id)), uint8(ChipIn.State.Released), "lock resets after a reverted call");
    }

    function test_Reentrancy_RefundCannotReenter() public {
        vm.skip(!mock);
        uint256 id = _createListedBill();
        uint64 dl = chipIn.getBill(id).deadline;
        _approveAndPay(alice, id, 0);
        vm.warp(dl);
        MockUSDC(address(USDC)).setReenter(address(chipIn), abi.encodeCall(ChipIn.refund, (id)));
        vm.expectRevert(ChipIn.Reentrancy.selector);
        vm.prank(alice);
        chipIn.refund(id);
        assertEq(chipIn.contributed(id, alice), 10 * USDC_1, "state rolled back");
        MockUSDC(address(USDC)).setReenter(address(0), "");
        vm.prank(alice);
        chipIn.refund(id);
        assertEq(chipIn.contributed(id, alice), 0);
    }

    function test_Reentrancy_PayCannotReenter() public {
        vm.skip(!mock);
        uint256 id = _createOpenBill(2 * USDC_1, 2);
        _approve(alice, 2 * USDC_1);
        MockUSDC(address(USDC)).setReenter(address(chipIn), abi.encodeCall(ChipIn.pay, (id, 1)));
        vm.expectRevert(ChipIn.Reentrancy.selector);
        vm.prank(alice);
        chipIn.pay(id, 0);
        assertEq(_held(id), 0, "state rolled back");
    }
}

// =====================================================================
// Fuzz
// =====================================================================
contract ChipInFuzzTest is ChipInTestBase {
    function testFuzz_EqualSplit_SumsToTotal(uint256 total, uint8 nRaw) public pure {
        uint256 n = bound(uint256(nRaw), 1, 32);
        total = bound(total, n, CAP);
        uint256[] memory s = _splitEqual(total, n);
        uint256 sum;
        uint256 mn = type(uint256).max;
        uint256 mx;
        for (uint256 i = 0; i < n; i++) {
            assertGt(s[i], 0);
            sum += s[i];
            if (s[i] < mn) mn = s[i];
            if (s[i] > mx) mx = s[i];
        }
        assertEq(sum, total);
        assertLe(mx - mn, 1);
    }

    function testFuzz_CreateBill_TotalIsSumAndCapEnforced(uint256[5] memory raw) public {
        uint256[] memory amounts = new uint256[](5);
        uint256 total;
        for (uint256 i = 0; i < 5; i++) {
            amounts[i] = bound(raw[i], 1, CAP / 4);
            total += amounts[i];
        }
        if (total > CAP) {
            vm.expectRevert(abi.encodeWithSelector(ChipIn.OverCap.selector, total, CAP));
            chipIn.createBill(payee, _deadline(), _zeros(5), amounts);
        } else {
            uint256 id = chipIn.createBill(payee, _deadline(), _zeros(5), amounts);
            uint256 t = chipIn.getBill(id).total;
            assertEq(t, total);
        }
    }

    function testFuzz_Lifecycle_PayAllThenRelease(uint8 nRaw, uint256 total, uint256 seed) public {
        uint256 n = bound(uint256(nRaw), 1, 32);
        total = bound(total, n, CAP);
        uint256 id = _createOpenBill(total, n);
        uint256 payeeBefore = _bal(payee);
        for (uint256 i = 0; i < n; i++) {
            address p = vm.addr(uint256(keccak256(abi.encode(seed, i))) % type(uint160).max + 1);
            (, uint256 amount,) = chipIn.getShare(id, i);
            _fund(p, amount);
            _approve(p, amount);
            vm.prank(p);
            chipIn.pay(id, i);
            uint256 paid = chipIn.getBill(id).paid;
            assertLe(paid, total, "paid never exceeds total");
            assertEq(_bal(address(chipIn)), paid);
        }
        assertEq(uint8(_state(id)), uint8(ChipIn.State.Funded));
        chipIn.release(id);
        assertEq(_bal(payee) - payeeBefore, total);
        assertEq(_held(id), 0);
        assertEq(_bal(address(chipIn)), 0);
    }

    function testFuzz_Lifecycle_PartialThenRefund(uint8 nRaw, uint8 kRaw, uint256 total, uint256 seed) public {
        uint256 n = bound(uint256(nRaw), 2, 32);
        uint256 k = bound(uint256(kRaw), 1, n - 1); // strictly short
        total = bound(total, n, CAP);
        uint256 id = _createOpenBill(total, n);
        uint64 dl = chipIn.getBill(id).deadline;
        address[] memory payers = new address[](k);
        uint256[] memory paidBy = new uint256[](k);
        for (uint256 i = 0; i < k; i++) {
            payers[i] = vm.addr(uint256(keccak256(abi.encode(seed, i, "r"))) % type(uint160).max + 1);
            (, uint256 amount,) = chipIn.getShare(id, i);
            _fund(payers[i], amount);
            _approve(payers[i], amount);
            vm.prank(payers[i]);
            chipIn.pay(id, i);
            paidBy[i] = amount;
        }
        assertEq(uint8(_state(id)), uint8(ChipIn.State.Open));
        vm.warp(dl);
        assertEq(uint8(_state(id)), uint8(ChipIn.State.Expired));
        for (uint256 i = 0; i < k; i++) {
            uint256 expected = chipIn.contributed(id, payers[i]);
            if (expected == 0) continue; // same derived address paid twice and already refunded
            uint256 before = _bal(payers[i]);
            vm.prank(payers[i]);
            chipIn.refund(id);
            assertEq(_bal(payers[i]) - before, expected);
        }
        assertEq(_held(id), 0);
        assertEq(_bal(address(chipIn)), 0);
    }
}
