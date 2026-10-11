// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "../src/ChipIn.sol";

/// @notice Run ONLY under Arc Foundry (`FOUNDRY_PROFILE=arc arc-forge test`
///         or `--fork-url` of an Arc network). These tests prove that the
///         test EVM really exposes Arc's USDC interface at 0x36 and that
///         funding an account maps onto the 6-decimal ERC-20 view. They are
///         expected to FAIL on a standard EVM.
contract ArcProbeTest is Test {
    IERC20 constant USDC = IERC20(0x3600000000000000000000000000000000000000);

    function test_ArcProbe_UsdcHasCode() public view {
        assertGt(address(USDC).code.length, 0, "no code at 0x36: not an Arc EVM");
    }

    function test_ArcProbe_UsdcDecimalsIs6() public view {
        assertEq(USDC.decimals(), 6);
    }

    function test_ArcProbe_DealMapsToErc20Balance() public {
        address a = makeAddr("probe");
        vm.deal(a, 5 ether); // 5 USDC in 18-decimal native units
        assertEq(USDC.balanceOf(a), 5_000_000, "native 5e18 must read as 5e6 on the ERC-20 view");
    }

    function test_ArcProbe_Erc20TransferMovesNativeBalance() public {
        address a = makeAddr("probeA");
        address b = makeAddr("probeB");
        vm.deal(a, 2 ether);
        vm.prank(a);
        USDC.transfer(b, 1_500_000);
        assertEq(USDC.balanceOf(b), 1_500_000);
        assertEq(b.balance, 1.5 ether, "ERC-20 transfer must move the shared native balance");
    }
}
