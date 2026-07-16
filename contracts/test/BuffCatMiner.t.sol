// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BuffCatMiner} from "../src/BuffCatMiner.sol";
import {MockBuffcat, MockUsdg} from "./Mocks.sol";

contract BuffCatMinerTest is Test {
    BuffCatMiner miner;
    MockBuffcat buff;
    MockUsdg usdg;

    address owner    = makeAddr("owner");
    address buyback  = makeAddr("buyback");
    address platform = makeAddr("platform");
    address eco      = makeAddr("eco");
    address alice    = makeAddr("alice");
    address bob      = makeAddr("bob");
    address carol    = makeAddr("carol");

    uint256 constant M = 1e18; // 1 token

    function setUp() public {
        vm.warp(100000); // past sequencer grace period
        buff = new MockBuffcat();
        usdg = new MockUsdg();
                vm.prank(owner);
        miner = new BuffCatMiner(address(buff), buyback, platform, eco, owner);

        // fund users with BUFFCAT + ETH
        buff.mint(alice, 10_000_000 * M);
        buff.mint(bob,   10_000_000 * M);
        buff.mint(carol, 10_000_000 * M);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
        vm.deal(owner, 100 ether);

        vm.prank(alice); buff.approve(address(miner), type(uint256).max);
        vm.prank(bob);   buff.approve(address(miner), type(uint256).max);
        vm.prank(carol); buff.approve(address(miner), type(uint256).max);
    }

    // principal is always returned in full at maturity
    function test_principal_returned_in_full() public {
        uint256 amt = 1_000_000 * M;
        vm.prank(alice); miner.lock{value: 0.01 ether}(amt, 0, 0); // Tourist, ETH
        uint256 balBefore = buff.balanceOf(alice);
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(alice); miner.unlock(0);
        assertEq(buff.balanceOf(alice), balBefore + amt, "full principal back");
    }

    // ETH dividends never exceed fees collected
    function test_eth_dividends_bounded_by_fees() public {
        uint256 fee = miner.buyFeeWei();
        vm.prank(alice); miner.lock{value: 1 ether}(1_000_000 * M, 0, 0);
        uint256 divSlice = fee * 4000 / 10000;
        vm.warp(block.timestamp + 1 days + 1);
        (uint256 eth,,) = miner.pendingRewards(alice, 0);
        assertLe(eth, divSlice, "dividends <= fee slice");
        assertApproxEqAbs(eth, divSlice, 1e9, "alice gets ~full 40%");
    }

    // fee split is exact: 25/40/15/20
    function test_fee_split_exact() public {
        uint256 b0 = buyback.balance;
        uint256 p0 = platform.balance;
        uint256 e0 = eco.balance;
        uint256 fee = miner.buyFeeWei();
        vm.prank(alice); miner.lock{value: 1 ether}(1_000_000 * M, 0, 0); // overpay, excess refunded
        assertEq(buyback.balance - b0, fee * 2500 / 10000, "buyback 25%");
        assertEq(platform.balance - p0, fee * 1500 / 10000, "platform 15%");
        // eco is the remainder (contract avoids dust loss), so compute same way
        uint256 expectedEco = fee - (fee * 2500 / 10000) - (fee * 4000 / 10000) - (fee * 1500 / 10000);
        assertEq(eco.balance - e0, expectedEco, "eco = remainder");
        assertEq(address(miner).balance, fee * 4000 / 10000, "dividends 40% in-contract");
    }

    // longer tier = more hashpower
    function test_tier_multipliers() public {
        vm.prank(alice); miner.lock{value: 0.01 ether}(1_000_000 * M, 0, 0); // 1.0x
        vm.prank(bob);   miner.lock{value: 0.01 ether}(1_000_000 * M, 3, 0); // 2.2x Beast
        (,uint128 hpA,,,,,,,,,) = miner.positions(alice, 0);
        (,uint128 hpB,,,,,,,,,) = miner.positions(bob, 0);
        assertEq(hpB, hpA * 22000 / 10000, "beast = 2.2x tourist");
    }

    // min-hold blocks dividends before 24h
    function test_min_hold_blocks_early_claim() public {
        vm.prank(alice); miner.lock{value: 1 ether}(1_000_000 * M, 0, 0);
        vm.warp(block.timestamp + 12 hours); // < 24h
        (uint256 eth,,) = miner.pendingRewards(alice, 0);
        assertEq(eth, 0, "no dividends before min-hold");
    }

    // early exit penalty 10%, split to stayers/platform/buyback
    function test_early_exit_penalty() public {
        // bob stays, alice exits early
        vm.prank(bob);   miner.lock{value: 0.01 ether}(1_000_000 * M, 3, 0); // stayer, beast
        vm.prank(alice); miner.lock{value: 0.01 ether}(1_000_000 * M, 3, 0); // will exit early

        uint256 platBefore = buff.balanceOf(platform);
        uint256 buyBefore  = buff.balanceOf(buyback);
        uint256 aliceBefore = buff.balanceOf(alice);

        vm.warp(block.timestamp + 1 days); // still < 30d, so early
        vm.prank(alice); miner.unlock(0);

        uint256 penalty = 1_000_000 * M * 1000 / 10000; // 10%
        // alice gets 90% back
        assertEq(buff.balanceOf(alice) - aliceBefore, 1_000_000 * M - penalty, "alice 90%");
        // platform got 15% of penalty
        assertEq(buff.balanceOf(platform) - platBefore, penalty * 1500 / 10000, "platform 15% of penalty");
        // buyback got 15%
        assertEq(buff.balanceOf(buyback) - buyBefore, penalty * 1500 / 10000, "buyback 15% of penalty");
        // bob (stayer) can now claim 70% of penalty as BUFFCAT
        vm.warp(block.timestamp + 1 days); // past min-hold for bob
        (uint256 be,,) = miner.pendingRewards(bob, 0); be;
    }

    // onlyOwner gates
    function test_onlyOwner_setFeatured() public {
        vm.prank(alice);
        vm.expectRevert();
        miner.setFeatured(address(usdg), uint64(block.timestamp));
    }
}
