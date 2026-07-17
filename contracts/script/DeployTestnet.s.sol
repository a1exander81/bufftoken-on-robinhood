// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

// ---------------------------------------------------------------------------
// DeployTestnet.s.sol — Robinhood Chain TESTNET deploy for BuffCatMiner.
//
// PLACE THIS AT: contracts/script/DeployTestnet.s.sol
//
// It deploys a fresh MockBuffcat (your existing test token) as stand-in for
// BUFFCAT, mints a supply to the deployer, then deploys BuffCatMiner wired to:
//   - buffcat  = the mock just deployed
//   - buyback  = real buyback wallet   (receive-only, safe to use real addr)
//   - platform = real platform wallet  (receive-only)
//   - eco      = real eco wallet        (receive-only)
//   - owner    = the DEPLOYER address   (so you can click onlyOwner buttons
//                on testnet WITHOUT ever loading the real owner key)
//
// It reads addresses from env so nothing sensitive is hardcoded. The only
// secret (PRIVATE_KEY) is a THROWAWAY testnet deployer key, never the real one.
//
// Import note: Mocks.sol lives under test/, which forge excludes from the
// default src build — but `forge script` compiles the script's own imports,
// so importing it directly here works without moving the file.
// ---------------------------------------------------------------------------

import {Script, console} from "forge-std/Script.sol";
import {BuffCatMiner} from "../src/BuffCatMiner.sol";
import {MockBuffcat} from "../test/Mocks.sol";

contract DeployTestnet is Script {
    function run() external {
        // --- inputs from env -------------------------------------------------
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");          // throwaway testnet key
        address deployer    = vm.addr(deployerKey);

        // Real receive-only wallets from PROGRESS.md. Overridable via env if you
        // ever want throwaways instead; falls back to the real ones by default.
        address buyback  = vm.envOr("BUYBACK_WALLET",  address(0xEBFB19E12810039Fba51fABe9D45Fdd8A8342707));
        address platform = vm.envOr("PLATFORM_WALLET", address(0x640e846504b8b179885E36fF9FcC353Bf08F4b1F));
        address eco      = vm.envOr("ECO_WALLET",      address(0x13864051772FDFBce895d21a483eee02edaeB445));

        // Owner = deployer on TESTNET so onlyOwner buttons are clickable with a
        // key you control. For MAINNET (Step 7) this becomes the real owner.
        address owner = deployer;

        console.log("Deployer / testnet owner:", deployer);
        console.log("Buyback  :", buyback);
        console.log("Platform :", platform);
        console.log("Eco      :", eco);

        vm.startBroadcast(deployerKey);

        // 1. Mock BUFFCAT + supply to the deployer so you can lock right away.
        MockBuffcat buffcat = new MockBuffcat(); // mints 1e27 to deployer in its ctor
        console.log("MockBuffcat:", address(buffcat));

        // 2. The miner.
        BuffCatMiner miner = new BuffCatMiner(
            address(buffcat),
            buyback,
            platform,
            eco,
            owner
        );
        console.log("BuffCatMiner:", address(miner));

        vm.stopBroadcast();

        // --- post-deploy sanity checks (revert the script if wrong) ----------
        require(address(miner.buffcat()) == address(buffcat), "buffcat mismatch");
        require(miner.buybackWallet()  == buyback,  "buyback mismatch");
        require(miner.platformWallet() == platform, "platform mismatch");
        require(miner.ecoWallet()      == eco,      "eco mismatch");
        require(miner.owner()          == owner,    "owner mismatch");
        require(miner.buyFeeWei() >= miner.MIN_BUY_FEE()
             && miner.buyFeeWei() <= miner.MAX_BUY_FEE(), "buyFee out of bounds");

        console.log("");
        console.log("=== Deploy OK. Next: verify + set MINER_ADDRESS in mining.js ===");
        console.log("Set mining.js MINER_ADDRESS to:", address(miner));
        console.log("(mining.js is currently pointed at testnet? check its chainId/RPC)");
    }
}
