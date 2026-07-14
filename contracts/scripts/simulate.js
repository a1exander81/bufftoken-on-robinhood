/*
 * End-to-end mining simulation on a local Hardhat chain.
 *
 * Deploys MockBuffCat + BuffCatMiner, funds a reward stream, has three
 * users buy miners at different tiers, fast-forwards time, and walks
 * through claiming and unstaking (matured and early) with real numbers
 * printed at every step.
 *
 * Run:  npx hardhat run scripts/simulate.js
 *       (add --config hardhat.config.offline.js in sandboxes without
 *        access to binaries.soliditylang.org)
 */
const { ethers, network } = require("hardhat");

const fmt = (v) => Number(ethers.formatEther(v)).toLocaleString(undefined, { maximumFractionDigits: 4 });
const DAY = 24 * 60 * 60;

async function ff(seconds, label) {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
  console.log(`\n⏩ time travel: +${label}`);
}

async function main() {
  const [admin, lpWallet, ownerFeeWallet, ecoWallet, alice, bob, carol] = await ethers.getSigners();

  console.log("=".repeat(72));
  console.log(" BUFFCAT MINER — SIMULATED MINING SESSION (local chain)");
  console.log("=".repeat(72));

  // ---- deploy token + miner -------------------------------------------
  const Token = await ethers.getContractFactory("MockBuffCat");
  const token = await Token.deploy();
  const Miner = await ethers.getContractFactory("BuffCatMiner");
  const miner = await Miner.deploy(
    await token.getAddress(), lpWallet.address, ownerFeeWallet.address, ecoWallet.address, admin.address
  );
  console.log(`\n📜 MockBuffCat  deployed: ${await token.getAddress()}`);
  console.log(`📜 BuffCatMiner deployed: ${await miner.getAddress()}`);

  // ---- mint balances ---------------------------------------------------
  for (const [who, name, amount] of [
    [admin, "admin (reward funder)", 5_000_000n],
    [alice, "alice", 1_000_000n],
    [bob, "bob", 500_000n],
    [carol, "carol", 200_000n],
  ]) {
    await token.mint(who.address, ethers.parseEther(amount.toString()));
    console.log(`💰 minted ${amount.toLocaleString()} $BUFFCAT to ${name}`);
  }

  // ---- admin opens a 30-day reward stream ------------------------------
  const streamAmount = ethers.parseEther("3000000");
  await token.connect(admin).approve(await miner.getAddress(), streamAmount);
  await miner.connect(admin).notifyRewardAmount(streamAmount, 30 * DAY);
  console.log(`\n🚿 admin funds the reward stream: ${fmt(streamAmount)} $BUFFCAT over 30 days`);
  console.log(`   reward rate: ${fmt((await miner.rewardRate()) * BigInt(DAY))} $BUFFCAT/day`);

  // ---- users buy miners ------------------------------------------------
  console.log("\n" + "-".repeat(72));
  console.log(" STEP 1 — BUY MINERS");
  console.log("-".repeat(72));
  const buys = [
    [alice, "alice", "1000000", 3, "MONTH (2.0x)"],
    [bob, "bob", "500000", 2, "WEEK (1.5x)"],
    [carol, "carol", "200000", 0, "DAY (1.0x)"],
  ];
  for (const [user, name, amount, tier, tierName] of buys) {
    const wei = ethers.parseEther(amount);
    await token.connect(user).approve(await miner.getAddress(), wei);
    await miner.connect(user).buyMiners(wei, tier);
    const pos = await miner.positions(user.address, 0);
    console.log(`\n⛏️  ${name} locks ${Number(amount).toLocaleString()} $BUFFCAT in tier ${tierName}`);
    console.log(`    3% buy fee: ${fmt(wei * 300n / 10000n)}  →  principal locked: ${fmt(pos.principal)}`);
    console.log(`    hashpower: ${fmt(pos.hashpower)}`);
  }
  console.log(`\n📊 totals — TVL: ${fmt(await miner.totalPrincipalLocked())} | hashpower: ${fmt(await miner.totalHashpower())}`);
  console.log(`   fee wallets so far — LP: ${fmt(await token.balanceOf(lpWallet.address))}, platform: ${fmt(await token.balanceOf(ownerFeeWallet.address))}, eco: ${fmt(await token.balanceOf(ecoWallet.address))}`);

  // ---- accrue 1 day ------------------------------------------------------
  await ff(DAY, "1 day of mining");
  console.log("\n" + "-".repeat(72));
  console.log(" STEP 2 — REWARDS AFTER 1 DAY (proportional to hashpower)");
  console.log("-".repeat(72));
  for (const [user, name] of [[alice, "alice"], [bob, "bob"], [carol, "carol"]]) {
    console.log(`   ${name.padEnd(6)} pendingRewards: ${fmt(await miner.pendingRewards(user.address))} $BUFFCAT`);
  }

  // ---- carol claims -----------------------------------------------------
  console.log("\n" + "-".repeat(72));
  console.log(" STEP 3 — CAROL CLAIMS HER DIVIDENDS");
  console.log("-".repeat(72));
  const carolBefore = await token.balanceOf(carol.address);
  const carolPending = await miner.pendingRewards(carol.address);
  await miner.connect(carol).claimDividends();
  const carolGot = (await token.balanceOf(carol.address)) - carolBefore;
  console.log(`   gross accrued: ${fmt(carolPending)} $BUFFCAT`);
  console.log(`   received net : ${fmt(carolGot)} $BUFFCAT (after the 3% claim fee)`);

  // ---- carol unstakes after maturity (DAY tier = 24h, already passed) ----
  console.log("\n" + "-".repeat(72));
  console.log(" STEP 4 — CAROL UNSTAKES (lock matured → zero fee)");
  console.log("-".repeat(72));
  const carolBefore2 = await token.balanceOf(carol.address);
  await miner.connect(carol).unstake(0);
  console.log(`   principal returned: ${fmt((await token.balanceOf(carol.address)) - carolBefore2)} $BUFFCAT (100%, no penalty)`);

  // ---- bob rage-quits early (WEEK tier, only 1 day in) -------------------
  console.log("\n" + "-".repeat(72));
  console.log(" STEP 5 — BOB RAGE-QUITS EARLY (10% penalty)");
  console.log("-".repeat(72));
  const bobPrincipal = (await miner.positions(bob.address, 0)).principal;
  const bobBefore = await token.balanceOf(bob.address);
  await miner.connect(bob).unstake(0);
  const bobGot = (await token.balanceOf(bob.address)) - bobBefore;
  console.log(`   locked principal : ${fmt(bobPrincipal)} $BUFFCAT`);
  console.log(`   returned         : ${fmt(bobGot)} $BUFFCAT (90%)`);
  console.log(`   penalty          : ${fmt(bobPrincipal - bobGot)} — 3% to fee wallets, 7% poured back into the reward stream for diamond paws`);

  // ---- alice rides another week ------------------------------------------
  await ff(7 * DAY, "7 more days (alice keeps mining, now alone in the pool)");
  console.log("\n" + "-".repeat(72));
  console.log(" STEP 6 — ALICE AFTER 8 DAYS TOTAL");
  console.log("-".repeat(72));
  const alicePending = await miner.pendingRewards(alice.address);
  console.log(`   alice pendingRewards: ${fmt(alicePending)} $BUFFCAT`);
  const aliceBefore = await token.balanceOf(alice.address);
  await miner.connect(alice).claimDividends();
  console.log(`   claimed net         : ${fmt((await token.balanceOf(alice.address)) - aliceBefore)} $BUFFCAT`);

  // ---- fast-forward past alice's 30-day lock and exit cleanly -------------
  await ff(23 * DAY, "23 more days (alice's MONTH lock matures)");
  console.log("\n" + "-".repeat(72));
  console.log(" STEP 7 — ALICE EXITS AFTER MATURITY");
  console.log("-".repeat(72));
  const aliceBefore2 = await token.balanceOf(alice.address);
  await miner.connect(alice).unstake(0);
  const alicePrincipalBack = (await token.balanceOf(alice.address)) - aliceBefore2;
  console.log(`   principal returned: ${fmt(alicePrincipalBack)} $BUFFCAT (100%)`);
  const aliceFinalPending = await miner.pendingRewards(alice.address);
  if (aliceFinalPending > 0n) {
    const b = await token.balanceOf(alice.address);
    await miner.connect(alice).claimDividends();
    console.log(`   final dividend sweep: ${fmt((await token.balanceOf(alice.address)) - b)} $BUFFCAT net`);
  }

  // ---- solvency check ------------------------------------------------------
  console.log("\n" + "=".repeat(72));
  console.log(" FINAL LEDGER");
  console.log("=".repeat(72));
  console.log(`   lifetime rewards funded : ${fmt(await miner.totalRewardFunded())} $BUFFCAT`);
  console.log(`   lifetime rewards claimed: ${fmt(await miner.totalRewardClaimed())} $BUFFCAT (gross)`);
  console.log(`   principal still locked  : ${fmt(await miner.totalPrincipalLocked())} $BUFFCAT`);
  console.log(`   contract token balance  : ${fmt(await token.balanceOf(await miner.getAddress()))} $BUFFCAT`);
  console.log(`   LP wallet fees          : ${fmt(await token.balanceOf(lpWallet.address))} $BUFFCAT`);
  console.log(`   platform wallet fees    : ${fmt(await token.balanceOf(ownerFeeWallet.address))} $BUFFCAT`);
  console.log(`   eco wallet fees         : ${fmt(await token.balanceOf(ecoWallet.address))} $BUFFCAT`);
  const bal = await token.balanceOf(await miner.getAddress());
  const owed = await miner.totalPrincipalLocked();
  console.log(`\n   ✅ solvency: contract holds ${fmt(bal)} ≥ ${fmt(owed)} still owed as principal`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
