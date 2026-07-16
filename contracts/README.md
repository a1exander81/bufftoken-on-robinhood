# BuffCatMiner — Contracts (v2: oracle removed, flat fee)

Lock BUFFCAT, earn ETH/USDG/featured dividends. Principal always returned in full.
Fee is a FLAT ETH amount (owner-adjustable, hard-capped) — no oracle, no in-contract
swap. Validated against a live reference contract on Robinhood Chain
(0x56910D4409F3a0C78C64DD8D0545FF0705389870) that uses the same fee->distribute
pattern for its NVDA dividend.

## Files
- `src/BuffCatMiner.sol` — main contract (~440 lines)
- `src/PriceGuard.sol.unused` — Chainlink oracle reader, NOT currently used.
  Kept in case a future version wants dollar-pegged fees. Rename to .sol and
  re-integrate if needed (see chat history for the wiring).
- `test/` — 20 tests: core, attacks, hostile-token, featured, compound, invariants

## Setup on your Mac
```bash
cd ~/Desktop/bufftoken-on-robinhood
git checkout main && git pull && git checkout -b feature/buffcat-miner
mkdir -p contracts && cd contracts
forge init . --force --no-git
forge install OpenZeppelin/openzeppelin-contracts --no-git
forge install foundry-rs/forge-std --no-git
printf '@openzeppelin/=lib/openzeppelin-contracts/\nforge-std/=lib/forge-std/src/\n' > remappings.txt
# copy the src/BuffCatMiner.sol and test/*.sol files from this folder in
forge test          # should show 20 passing
forge test --match-path test/Invariant.t.sol -vvv   # 128k-call solvency fuzz
```

## Then — Slither (runs cleanly on your Mac, not in a sandbox)
```bash
pip3 install slither-analyzer
slither src/BuffCatMiner.sol
```

## Model (confirmed, simplified)
- Lock BUFFCAT (returned 100% at unlock)
- FLAT ETH platform fee (buyFeeWei, default 0.003 ETH ~ $5).
  Owner can adjust within hard bounds: 0.0005–0.05 ETH. No oracle.
- Split: 25 buyback / 40 dividends / 15 platform / 20 eco
- Tiers: Tourist 1d 1.0x / GymTrial 3d 1.25x / Member 7d 1.6x / Beast 30d 2.2x /
  DiamondPaws 1y 3.5x / Chad 10y 5.0x / Ascended 100y 6.0x
- Dividends: ETH / USDG / featured (BUFF'mania) — investor picks
- Featured (e.g. NVDA): owner manually buys NVDA with buyback ETH, calls
  fundFeatured() to deposit it. 1.3x bonus, snapshot-gated (front-run proof).
  Validated: NVDA is contract-transferable (see reference contract).
- Compound: 2% fee, preserves pending, mining-power credit
- Early exit: 10% penalty -> 70% stayers / 15% platform / 15% buyback
- Min-hold 24h before dividends accrue
- MAX_LOCK cap: 30M tokens per position (TVL control)

## Validated token addresses (Robinhood Chain)
- WETH: 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73
- USDG: 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168 (Global Dollar, Paxos)
- NVDA: 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC (NVIDIA Tokenized Stock)
  Note: ERC-8056 scaled-UI token, uiMultiplier() currently 1.0 for all live
  stock tokens. Balance-delta accounting in the miner handles this correctly.

## Wallets (immutable at deploy)
- Deployer/Owner: 0xc2413696576176d1e31D55a2DEdA609906a15596
- Buyback:  0xEBFB19E12810039Fba51fABe9D45Fdd8A8342707
- Platform: 0x640e846504b8b179885E36fF9FcC353Bf08F4b1F
- Eco:      0x13864051772FDFBce895d21a483eee02edaeB445
- Dividends: stay in-contract

## STILL TODO before mainnet
- Run Slither on Mac
- Deploy to TESTNET first, verify on Blockscout
- Test NVDA fund/distribute end-to-end on testnet (confirm no transfer gates)
- Human audit (Claude review != audit)
- Never rush a contract holding user funds
