// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {console} from "forge-std/console.sol";
import {ChipInTestBase, ChipIn} from "./ChipIn.t.sol";

/// @notice Informational gas figures for the budget in the mainnet runbook.
contract ChipInGasTest is ChipInTestBase {
    function test_Gas_Figures() public {
        uint256 g0 = gasleft();
        ChipIn c = new ChipIn(CAP, DURATION);
        console.log("gas deploy", g0 - gasleft());
        assertTrue(address(c) != address(0));

        g0 = gasleft();
        vm.prank(carol);
        uint256 id = chipIn.createBill(payee, _deadline(), _two(alice, address(0)), _two(400_000, 350_000));
        console.log("gas createBill 2 shares", g0 - gasleft());

        _approve(alice, 400_000);
        g0 = gasleft();
        vm.prank(alice);
        chipIn.pay(id, 0);
        console.log("gas pay first share", g0 - gasleft());

        _approve(bob, 350_000);
        g0 = gasleft();
        vm.prank(bob);
        chipIn.pay(id, 1);
        console.log("gas pay last share (funds)", g0 - gasleft());

        g0 = gasleft();
        chipIn.release(id);
        console.log("gas release", g0 - gasleft());

        uint256 id2 = _createOpenBill(600_000, 2);
        _approveAndPay(bob, id2, 0);
        vm.warp(chipIn.getBill(id2).deadline);
        g0 = gasleft();
        vm.prank(bob);
        chipIn.refund(id2);
        console.log("gas refund", g0 - gasleft());
    }
}
