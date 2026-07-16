// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {BuffCatMiner} from "../src/BuffCatMiner.sol";
import {MockBuffcat} from "./Mocks.sol";

// Handler drives random sequences of lock/claim/unlock/compound/fund
contract Handler is Test {
    BuffCatMiner public miner;
    MockBuffcat public buff;
    address public owner;
    address[] public actors;
    uint256 public ghost_totalFeesEth; // track ETH fees ever paid in

    constructor(BuffCatMiner _m, MockBuffcat _b, address _owner) {
        miner = _m; buff = _b; owner = _owner;
        for (uint256 i = 0; i < 5; i++) {
            address a = makeAddr(string(abi.encodePacked("actor", i)));
            actors.push(a);
            buff.mint(a, 100_000_000 * 1e18);
            vm.deal(a, 1000 ether);
            vm.prank(a); buff.approve(address(miner), type(uint256).max);
        }
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function lock(uint256 seed, uint256 amt, uint8 tier, uint8 choice) external {
        address a = _actor(seed);
        amt = bound(amt, 1e18, 10_000_000 * 1e18);
        tier = uint8(bound(tier, 0, 6));
        choice = uint8(bound(choice, 0, 2));
        if (buff.balanceOf(a) < amt) return;
        uint256 fee = 0.01 ether;
        vm.prank(a);
        try miner.lock{value: fee}(amt, tier, choice) { ghost_totalFeesEth += fee; } catch {}
    }

    function claimAny(uint256 seed, uint256 posSeed) external {
        address a = _actor(seed);
        uint256 n = miner.positionCount(a);
        if (n == 0) return;
        uint256 posId = posSeed % n;
        vm.warp(block.timestamp + 2 days); // pass min-hold
        vm.prank(a);
        try miner.claim(posId) {} catch {}
    }

    function unlock(uint256 seed, uint256 posSeed) external {
        address a = _actor(seed);
        uint256 n = miner.positionCount(a);
        if (n == 0) return;
        uint256 posId = posSeed % n;
        vm.prank(a);
        try miner.unlock(posId) {} catch {}
    }

    function fundEth(uint256 amt) external {
        amt = bound(amt, 0.001 ether, 10 ether);
        vm.deal(owner, amt);
        vm.prank(owner);
        try miner.fundEthDividends{value: amt}() { ghost_totalFeesEth += amt; } catch {}
    }

    function warp(uint256 t) external {
        t = bound(t, 1 hours, 60 days);
        vm.warp(block.timestamp + t);
    }
}

contract InvariantTest is StdInvariant, Test {
    BuffCatMiner miner;
    MockBuffcat buff;
    Handler handler;
    address owner = makeAddr("owner");

    function setUp() public {
        vm.warp(100000); // past sequencer grace period
        buff = new MockBuffcat();
                vm.prank(owner);
        miner = new BuffCatMiner(address(buff), makeAddr("b"), makeAddr("p"), makeAddr("e"), owner);
        handler = new Handler(miner, buff, owner);
        targetContract(address(handler));
    }

    // INVARIANT 1: contract always holds enough BUFFCAT to return all principal
    function invariant_solventPrincipal() public view {
        assertGe(buff.balanceOf(address(miner)), miner.totalPrincipal(),
            "BUFFCAT balance must cover all locked principal");
    }

    // INVARIANT 2: ETH balance never goes negative / contract never owes more ETH than it holds
    function invariant_ethNeverNegative() public view {
        // trivially true (uint), but assert contract balance is sane vs fees seen
        assertLe(address(miner).balance, handler.ghost_totalFeesEth(),
            "ETH held <= total ETH ever paid in (can't create ETH)");
    }

    // INVARIANT 3: if no active hashpower, no principal locked
    function invariant_hashpowerPrincipalConsistent() public view {
        if (miner.totalHashpower() == 0) {
            assertEq(miner.totalPrincipal(), 0, "zero hashpower => zero principal");
        }
    }
}
