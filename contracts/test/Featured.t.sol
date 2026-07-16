// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BuffCatMiner} from "../src/BuffCatMiner.sol";
import {MockBuffcat, MockUsdg} from "./Mocks.sol";

contract FeaturedTest is Test {
    BuffCatMiner miner;
    MockBuffcat buff;
        MockUsdg nvda; // stand-in for featured token
    address owner = makeAddr("owner");
    address early = makeAddr("early");   // locks BEFORE campaign
    address frontrunner = makeAddr("frontrunner"); // tries to jump in AFTER snapshot

    function setUp() public {
        vm.warp(100000); // past sequencer grace period
        buff = new MockBuffcat();
        nvda = new MockUsdg();
        vm.prank(owner);
        miner = new BuffCatMiner(address(buff), makeAddr("b"), makeAddr("p"), makeAddr("e"), owner);
        buff.mint(early, 10_000_000 * 1e18);
        buff.mint(frontrunner, 10_000_000 * 1e18);
        vm.deal(early, 100 ether);
        vm.deal(frontrunner, 100 ether);
        vm.deal(owner, 100 ether);
        nvda.mint(owner, 1_000_000 * 1e18);
        vm.prank(early); buff.approve(address(miner), type(uint256).max);
        vm.prank(frontrunner); buff.approve(address(miner), type(uint256).max);
        vm.prank(owner); nvda.approve(address(miner), type(uint256).max);
    }

    // The core anti-front-run test:
    // - 'early' locks featured BEFORE the week snapshot -> eligible
    // - owner sets featured week (snapshot = now)
    // - 'frontrunner' locks featured AFTER snapshot -> NOT eligible
    // - owner funds featured pot -> only 'early' can claim it
    function test_snapshot_blocks_frontrunner() public {
        // early locks featured well before campaign
        vm.prank(early); miner.lock{value: 0.01 ether}(1_000_000 * 1e18, 3, 2); // choice=FEATURED

        // time passes, THEN owner opens the campaign with snapshot = now
        vm.warp(block.timestamp + 10 days);
        uint64 weekStart = uint64(block.timestamp);
        vm.prank(owner); miner.setFeatured(address(nvda), weekStart);

        // frontrunner sees the campaign and jumps in AFTER the snapshot
        vm.warp(block.timestamp + 1 hours);
        vm.prank(frontrunner); miner.lock{value: 0.01 ether}(1_000_000 * 1e18, 3, 2); // FEATURED, too late

        // owner funds the NVDA pot
        vm.prank(owner); miner.fundFeatured(100_000 * 1e18);

        // warp past min-hold for both
        vm.warp(block.timestamp + 2 days);

        (,, uint256 earlyFeat) = miner.pendingRewards(early, 0);
        (,, uint256 frFeat) = miner.pendingRewards(frontrunner, 0);

        assertGt(earlyFeat, 0, "early locker earns featured rewards");
        assertEq(frFeat, 0, "frontrunner earns NOTHING (locked after snapshot)");
    }

    // featured pot can only distribute what was funded (solvency)
    function test_featured_cannot_overpay() public {
        vm.prank(early); miner.lock{value: 0.01 ether}(1_000_000 * 1e18, 3, 2);
        vm.warp(block.timestamp + 5 days);
        // open campaign now: promotes early (locked 5 days ago) into eligible
        vm.prank(owner); miner.setFeatured(address(nvda), uint64(block.timestamp));

        vm.prank(owner); miner.fundFeatured(50_000 * 1e18);
        vm.warp(block.timestamp + 2 days);
        vm.prank(early); miner.claim(0);
        // early got featured tokens, contract didn't overpay
        assertLe(nvda.balanceOf(early), 50_000 * 1e18, "cannot claim more than funded");
        assertGt(nvda.balanceOf(early), 0, "but did receive featured reward");
    }
}
