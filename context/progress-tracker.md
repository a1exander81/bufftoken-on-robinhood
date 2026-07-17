# Progress Tracker

Update this file after every meaningful change. The git repo is the source
of truth; record only what is actually verified (cite tx hashes / test runs).

## Current Phase

- Step 5 of 7 — Testnet deploy & manual verification (IN PROGRESS).
- Steps 1–4 complete (design, contract, tests 20/20, Slither triaged).

## Current Goal

- Complete the testnet click-through (lock/claim/compound/unlock/early-exit/
  pause) and prove a Stock Token moves BOTH into and out of the contract.

## Completed

- Steps 1–3: contract built + tested. `forge test` = 20/20, incl. 3 invariants
  at 128,000 calls each, 0 reverts.
- Step 4 (Slither): 55 findings triaged. Fixed: constructor `_owner` shadowing
  (→ `_ownerAddr`) and 3 missing events (BuyFeeUpdated, UsdgDividendFunded,
  FeaturedFunded). All else consciously accepted (standard accumulator pattern,
  OZ internals, ABI-critical naming). Re-ran forge test (still 20/20) + Slither
  (down to 51, the 4 targeted findings gone).
- Frontend rewire: `mining.js` + `mining.html` corrected from the old
  NeiroMiner ABI to the real BuffCatMiner ABI — flat ETH buyFeeWei (not a 2%
  BUFFCAT skim), lock(amount,tier,choice), 7 tiers, per-position claim/unlock
  cards, stats strip shows lock fee (no fictional reward-rate). Committed +
  pushed to feature/buffcat-miner.
- Testnet deploy on Robinhood Chain (chain 46630), block 90901040:
  - BuffCatMiner: `0xEcd9e1E717D6628513E1E555702ED21a222872A5`
  - MockBuffcat:  `0xaBf15C76b8BB5493fb51DC5b8a625574486C5F67`
  - Owner/deployer (throwaway): `0x897D60882FE0d15cD81b6631462891Af38b3ef37`
- **NVDA/Stock-Token transfer, IN-direction: PROVEN on testnet 2026-07-17.**
  `fundFeatured` moved real RH-TSLA (`0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E`)
  into the contract via safeTransferFrom — status 1, 5e18 transferred.
  Test tx: `0xa9c7249e4d47afea57be5942c78c01920086f7e3ec9044f9c5c9e6a1508ecd59`.
  (Proven with RH-TSLA, not RH-NVDA — NVDA isn't faucet-obtainable on testnet —
  but Stock Tokens share one ERC-8056 impl, so this generalizes to NVDA.)

## In Progress

- Step 5 testnet click-through: lock (done via cast), setFeatured (done),
  fundFeatured (done). Remaining: claim, compound, unlock, early-exit, pause,
  setBuyFee from the frontend; and a full day soak.

## Next Up

- **Stock-Token OUT-direction:** a featured `claim(posId)` doing safeTransfer
  of the Stock Token OUT to a user. Needs a featured position past MIN_HOLD
  (24h), then claim. Do before any live NVDA campaign.
- Point the frontend at testnet (chainId 46630 / testnet RPC) — mining.js is
  currently wired to mainnet (0x1237).
- Blockscout-verify the deployed contract.

## Open Questions

- Featured `choice` selector UI (ETH/USDG/featured) not built — locks default
  to ETH (choice 0). Product decision on the buy-form control.
- Mainnet owner: must be hardware wallet or multisig (owner can reroute weekly
  featured rewards). Decide before Step 7.
- `setFeatured` guardrails (min interval between swaps, sanity checks) —
  optional hardening for the audit.

## Architecture Decisions

- Flat ETH lock fee (buyFeeWei, 0.0005–0.05 ETH), NOT a % skim of BUFFCAT.
  100% of principal returned at unlock. Fee split 25/40/15/20.
- O(1) scaled-accumulator dividends; no price oracle (deliberate — less audit
  surface). Featured campaigns snapshot-gated (front-run resistant), 1.3× bonus.
- MIN_HOLD = 24h before any dividend accrues.

## Session Notes

- Public testnet RPC (`rpc.testnet.chain.robinhood.com`) throws intermittent
  "null response" errors during gas estimation — txs often still land; verify
  by reading state (e.g. positionCount) before re-sending. Consider a dedicated
  Alchemy endpoint for Step 5 proper and mainnet.
- SECURITY: the original owner key (`0xc241…5596`) was exposed in terminal
  during this session and rotated away from; do not reuse it. Clear shell
  history. Testnet now uses throwaway `0x897D…ef37` via an encrypted cast
  keystore (`--account throwaway`).
- The Claude project mirror drifted from the repo repeatedly this session
  (stale mining.js, a never-committed BuffCatMiner_test.js). Re-upload context
  files via Project settings after repo changes; keep vendored libs out of it.
