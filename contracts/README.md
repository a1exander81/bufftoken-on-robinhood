# BuffCatMiner — Contracts

Lock BUFFCAT, earn ETH/USDG/featured dividends. Principal is always returned in
full. The fee is a FLAT ETH amount (owner-adjustable, hard-capped) — no oracle,
no in-contract swap.

**Authoritative context lives in `context/`** (see `CLAUDE.md` for read order).
This README covers the contracts directory only; where it disagrees with
`context/progress-tracker.md`, the tracker wins.

## Files

- `src/BuffCatMiner.sol` — the contract. The ONLY definition of economic logic.
- `test/` — 20 Foundry tests: core, attacks, hostile-token, featured, compound,
  invariants.
- `script/DeployTestnet.s.sol` — testnet deploy script.
- `foundry.toml` — `src = "src"`.

> A superseded contract of the same name lives in `legacy/contracts/`. It is NOT
> deployed and its fee math differs. Never compile or cite it. See
> `context/architecture.md` → Quarantine.

## Build and test

Foundry only. There is no Hardhat path and no `npm run build`.

```bash
cd contracts
forge build
forge test                                          # expect 20 passing
forge test --match-path test/Invariant.t.sol -vvv   # 128k-call solvency fuzz
```

Static analysis (run on a real machine, not a sandbox):

```bash
pip3 install slither-analyzer
slither .
```

> Do NOT run `forge init` here. The project is already initialized; `--force`
> would overwrite it.

## Model

- Lock BUFFCAT — returned 100% at unlock.
- FLAT ETH platform fee (`buyFeeWei`, default 0.003 ETH). Owner-adjustable
  within hard bounds 0.0005–0.05 ETH. No oracle, by design.
- Fee split: 25 buyback / 40 dividends / 15 platform / 20 eco.
- Tiers: Tourist 1d 1.0x / GymTrial 3d 1.25x / Member 7d 1.6x / Beast 30d 2.2x /
  DiamondPaws 1y 3.5x / Chad 10y 5.0x / Ascended 100y 6.0x.
- Dividends: ETH / USDG / featured — the investor picks via `choice`.
- Featured: owner funds the pot with `fundFeatured()`. 1.3x bonus,
  snapshot-gated (front-run resistant).
- Compound: 2% fee, preserves pending, credits hashpower.
- Early exit: 10% penalty → 70% stayers / 15% platform / 15% buyback.
- MIN_HOLD 24h before dividends accrue.
- MAX_LOCK: 30M tokens per position.

## Token addresses (Robinhood Chain)

- WETH: `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`
- USDG: `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` (Global Dollar, Paxos)
- BUFFCAT (mainnet, immutable): `0xD80aFe3Be875a14155FDd96D39669A6734E12036`
- NVDA (mainnet): `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC`
- RH-NVDA (testnet): `0xA916e8830d57cC9846E37859D90c24c5531e71c7` — exists but
  is NOT faucet-obtainable or openly mintable.
- RH-TSLA (testnet): `0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E` — used as the
  Stock-Token stand-in for testing.

Stock Tokens are ERC-8056 scaled-UI tokens; `uiMultiplier()` is currently 1.0
for all live ones. The miner's balance-delta accounting handles this correctly.

## Deployment status

Testnet (Robinhood Chain 46630), block 90901040 — deployed and Blockscout-verified:

- BuffCatMiner: `0xEcd9e1E717D6628513E1E555702ED21a222872A5`
- MockBuffcat:  `0xaBf15C76b8BB5493fb51DC5b8a625574486C5F67`
- Owner/deployer: a THROWAWAY key, `0x897D60882FE0d15cD81b6631462891Af38b3ef37`,
  held in an encrypted cast keystore. Reference it with `--account throwaway`,
  never `--private-key`.

**Mainnet: not deployed.** Blocked until Step 5 (testnet click-through) and
Step 6 (independent human audit) are both complete.

## Key handling

- Fee wallets are immutable constructor args — fixed at deploy, never
  owner-settable.
- The mainnet owner MUST be a hardware wallet or multisig. The owner can reroute
  weekly featured rewards, so a hot EOA is an unacceptable risk. The specific
  mainnet owner address is an OPEN DECISION — see `context/progress-tracker.md`.
- Never place a real owner key in a deploy env, a script, or a chat.

## Remaining before mainnet

See `context/progress-tracker.md` for the live list. At time of writing:
finish the testnet click-through (claim / compound / unlock / early-exit /
pause / setBuyFee), prove a Stock Token moves OUT via `claim`, then an
independent human audit. AI review is not an audit.
