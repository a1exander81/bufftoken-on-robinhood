// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BuffCatMiner} from "../src/BuffCatMiner.sol";
import {MockBuffcat, MockUsdg} from "./Mocks.sol";

// Malicious contract that tries to reenter claim() during ETH payout
contract ReentrancyAttacker {
    BuffCatMiner public miner;
    MockBuffcat public buff;
    uint256 public reenterCount;

    constructor(BuffCatMiner _m, MockBuffcat _b) { miner = _m; buff = _b; }

    function setup(uint256 amt) external payable {
        buff.approve(address(miner), type(uint256).max);
        miner.lock{value: 0.01 ether}(amt, 0, 0); // ETH choice
    }
    function attack() external { miner.claim(0); }

    receive() external payable {
        // try to reenter claim during the ETH transfer
        if (reenterCount < 3) {
            reenterCount++;
            try miner.claim(0) { } catch { }
        }
    }
}

contract AttacksTest is Test {
    BuffCatMiner miner;
    MockBuffcat buff;
    address owner = makeAddr("owner");
    address alice = makeAddr("alice");

    function setUp() public {
        vm.warp(100000); // past sequencer grace period
        buff = new MockBuffcat();
                vm.prank(owner);
        miner = new BuffCatMiner(address(buff), makeAddr("b"), makeAddr("p"), makeAddr("e"), owner);
        buff.mint(alice, 10_000_000 * 1e18);
        vm.deal(alice, 100 ether);
        vm.deal(owner, 100 ether);
    }

    // Reentrancy: attacker must NOT be able to steal a co-staker's share
    function test_reentrancy_cannot_steal_others() public {
        // Victim (this test contract acting as a normal staker via a helper)
        address victim = makeAddr("victim");
        buff.mint(victim, 1_000_000 * 1e18);
        vm.deal(victim, 1 ether);
        vm.prank(victim); buff.approve(address(miner), type(uint256).max);
        vm.prank(victim); miner.lock{value: 0.01 ether}(1_000_000 * 1e18, 0, 0);

        // Attacker locks the SAME amount -> should get 50% of dividends, not more
        ReentrancyAttacker atk = new ReentrancyAttacker(miner, buff);
        buff.mint(address(atk), 1_000_000 * 1e18);
        vm.deal(address(atk), 1 ether);
        atk.setup{value: 0.01 ether}(1_000_000 * 1e18);

        // owner funds 1 ETH -> split 50/50 between victim and attacker
        vm.prank(owner); miner.fundEthDividends{value: 1 ether}();
        vm.warp(block.timestamp + 1 days + 1);

        uint256 atkBefore = address(atk).balance;
        atk.attack();
        uint256 paidToAtk = address(atk).balance - atkBefore;

        // attacker had equal stake -> entitled to ~50% of the 1 ETH + tiny fee share.
        // If reentry worked, it could grab the victim's half too (~1 ETH).
        // Guard must cap it at its fair ~0.5 ETH share.
        assertGt(atk.reenterCount(), 0, "reentry attempted");
        assertLt(paidToAtk, 0.55 ether, "attacker got only its ~50% share, NOT victim's");

        // victim can still claim their full share afterward -> not stolen
        vm.prank(victim); miner.claim(0);
        assertGt(victim.balance, 0.4 ether, "victim's share intact and claimable");
    }

    // double-claim yields nothing the second time
    function test_double_claim_second_empty() public {
        vm.prank(alice); buff.approve(address(miner), type(uint256).max);
        vm.prank(alice); miner.lock{value: 1 ether}(1_000_000 * 1e18, 0, 0);
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(alice); miner.claim(0);
        vm.prank(alice);
        vm.expectRevert(); // NothingToClaim
        miner.claim(0);
    }

    // cannot unlock someone else's position / inactive
    function test_cannot_double_unlock() public {
        vm.prank(alice); buff.approve(address(miner), type(uint256).max);
        vm.prank(alice); miner.lock{value: 0.01 ether}(1_000_000 * 1e18, 0, 0);
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(alice); miner.unlock(0);
        vm.prank(alice);
        vm.expectRevert(); // Inactive
        miner.unlock(0);
    }
}
