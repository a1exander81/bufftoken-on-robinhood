// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BuffCatMiner} from "../src/BuffCatMiner.sol";
import {FeeOnTransferToken} from "./Mocks.sol";

// What if BUFFCAT itself were a fee-on-transfer token? (It isn't, but a hostile
// deployer or a future token could be.) The contract measures balance deltas,
// so principal accounting must use ACTUAL received, not the requested amount.
contract HostileTokenTest is Test {
    BuffCatMiner miner;
    FeeOnTransferToken fee;
    address owner = makeAddr("owner");
    address alice = makeAddr("alice");

    function setUp() public {
        vm.warp(100000); // past sequencer grace period
        fee = new FeeOnTransferToken();
                vm.prank(owner);
        miner = new BuffCatMiner(address(fee), makeAddr("b"), makeAddr("p"), makeAddr("e"), owner);
        fee.mint(alice, 10_000_000 * 1e18);
        vm.deal(alice, 100 ether);
        vm.prank(alice); fee.approve(address(miner), type(uint256).max);
    }

    // With a 10% fee-on-transfer token, locking 1M should record ~900k principal
    // (what actually arrived), NOT 1M. Otherwise the contract is insolvent.
    function test_fee_on_transfer_records_actual_received() public {
        vm.prank(alice); miner.lock{value: 0.01 ether}(1_000_000 * 1e18, 0, 0);
        // 10% taken in transfer -> 900k actually received
        uint256 recorded = miner.totalPrincipal();
        assertEq(recorded, 900_000 * 1e18, "records actual received, not requested");

        // and the contract must hold at least that much
        assertGe(fee.balanceOf(address(miner)), recorded, "solvent even with hostile token");
    }

    // unlocking must not try to send more than was received (would revert/drain)
    function test_fee_on_transfer_unlock_solvent() public {
        vm.prank(alice); miner.lock{value: 0.01 ether}(1_000_000 * 1e18, 0, 0);
        vm.warp(block.timestamp + 1 days + 1);
        uint256 recorded = miner.totalPrincipal();
        vm.prank(alice); miner.unlock(0);
        // principal cleared, no revert, contract didn't try to over-send
        assertEq(miner.totalPrincipal(), 0, "principal cleared cleanly");
        recorded;
    }
}
