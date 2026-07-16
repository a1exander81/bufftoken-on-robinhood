// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BuffCatMiner} from "../src/BuffCatMiner.sol";
import {MockBuffcat} from "./Mocks.sol";

contract CompoundTest is Test {
    BuffCatMiner miner;
    MockBuffcat buff;
    address owner = makeAddr("owner");
    address buyback = makeAddr("buyback");
    address alice = makeAddr("alice");

    function setUp() public {
        vm.warp(100000); // past sequencer grace period
        buff = new MockBuffcat();
                vm.prank(owner);
        miner = new BuffCatMiner(address(buff), buyback, makeAddr("p"), makeAddr("e"), owner);
        buff.mint(alice, 10_000_000 * 1e18);
        vm.deal(alice, 100 ether);
        vm.prank(alice); buff.approve(address(miner), type(uint256).max);
    }

    // Compounding charges 2% (vs 4% deposit), fee -> buyback, rest boosts position
    function test_compound_2pct_fee_to_buyback() public {
        vm.prank(alice); miner.lock{value: 0.01 ether}(1_000_000 * 1e18, 0, 0);
        uint256 buyBefore = buff.balanceOf(buyback);

        vm.prank(alice); miner.compound(0, 1_000_000 * 1e18);
        // 2% fee = 20,000 to buyback
        assertEq(buff.balanceOf(buyback) - buyBefore, 20_000 * 1e18, "2% compound fee to buyback");

        // position principal grew by net (98%)
        (uint128 principal,,,,,,,,,,) = miner.positions(alice, 0);
        assertEq(principal, 1_000_000 * 1e18 + 980_000 * 1e18, "principal += 98% of compound");
    }

    // compounding increases hashpower correctly (net * tier mult)
    function test_compound_boosts_hashpower() public {
        vm.prank(alice); miner.lock{value: 0.01 ether}(1_000_000 * 1e18, 3, 0); // Beast 2.2x
        (,uint128 hpBefore,,,,,,,,,) = miner.positions(alice, 0);
        vm.prank(alice); miner.compound(0, 1_000_000 * 1e18);
        (,uint128 hpAfter,,,,,,,,,) = miner.positions(alice, 0);
        // added hp = 980,000 * 2.2 = 2,156,000
        uint256 expectedAdd = 980_000 * 1e18 * 22000 / 10000;
        assertEq(uint256(hpAfter) - uint256(hpBefore), expectedAdd, "hashpower grew by net*tier");
    }

    // compound preserves already-accrued dividends (doesn't wipe them)
    function test_compound_preserves_pending() public {
        vm.prank(alice); miner.lock{value: 1 ether}(1_000_000 * 1e18, 0, 0);
        vm.warp(block.timestamp + 2 days);
        (uint256 ethBefore,,) = miner.pendingRewards(alice, 0);
        assertGt(ethBefore, 0, "has pending before compound");

        vm.prank(alice); miner.compound(0, 500_000 * 1e18);
        (uint256 ethAfter,,) = miner.pendingRewards(alice, 0);
        // pending should be preserved (compound settles debt at old hp first)
        assertApproxEqAbs(ethAfter, ethBefore, 1e12, "pending preserved across compound");
    }
}
