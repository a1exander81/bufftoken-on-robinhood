const { ethers } = require("hardhat");

// Fixed, audited fee wallets — see contracts/README.md for rationale.
const BUFFCAT_TOKEN = process.env.BUFFCAT_TOKEN_ADDRESS || "0xD80aFe3Be875a14155FDd96D39669A6734E12036";
const LP_WALLET = process.env.LP_WALLET_ADDRESS || "0x78a851D19E2152bB7162d8924CB2Bd088aca95C8";
const OWNER_FEE_WALLET = process.env.OWNER_FEE_WALLET_ADDRESS || "0xc2413696576176d1e31D55a2DEdA609906a15596";
const ECO_WALLET = process.env.ECO_WALLET_ADDRESS || "0x13864051772FDFBce895d21a483eee02edaeB445";

// ETH fee economics (all overridable via env):
// - BUY_FEE_ETH: fixed ETH charged on every buyMiners call; half accrues to the
//   platform wallet, half to the on-contract liquidity reserve.
// - LP_ETH_THRESHOLD / LP_ETH_INTERVAL: the reserve auto-release rule — the
//   whole reserve goes to the LP wallet when it reaches the threshold, or when
//   the interval has elapsed since the last release.
const BUY_FEE_ETH = process.env.BUY_FEE_ETH || "0.0005";
const LP_ETH_THRESHOLD = process.env.LP_ETH_THRESHOLD || "0.25";
const LP_ETH_INTERVAL_DAYS = process.env.LP_ETH_INTERVAL_DAYS || "7";

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = process.env.ADMIN_ADDRESS || deployer.address;

  console.log("Deployer:", deployer.address);
  console.log("Admin (owner):", admin);
  console.log("BUFFCAT token:", BUFFCAT_TOKEN);
  console.log("LP wallet:", LP_WALLET);
  console.log("Owner fee wallet:", OWNER_FEE_WALLET);
  console.log("Eco wallet:", ECO_WALLET);

  console.log("Buy fee (ETH):", BUY_FEE_ETH);
  console.log("LP release threshold (ETH):", LP_ETH_THRESHOLD, "| interval (days):", LP_ETH_INTERVAL_DAYS);

  const BuffCatMiner = await ethers.getContractFactory("BuffCatMiner");
  const miner = await BuffCatMiner.deploy(
    BUFFCAT_TOKEN, LP_WALLET, OWNER_FEE_WALLET, ECO_WALLET, admin,
    ethers.parseEther(BUY_FEE_ETH),
    ethers.parseEther(LP_ETH_THRESHOLD),
    BigInt(LP_ETH_INTERVAL_DAYS) * 86400n
  );
  await miner.waitForDeployment();

  const address = await miner.getAddress();
  console.log("\nBuffCatMiner deployed to:", address);
  console.log("\nNext steps:");
  console.log("1. Verify the contract on the Robinhood Chain explorer.");
  console.log("2. As the admin wallet, approve BUFFCAT to the contract and call");
  console.log("   notifyRewardAmount(amount, durationSeconds) to open the first reward stream.");
  console.log("3. Update the frontend contract address/ABI to point at:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
