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
- Context system added: CLAUDE.md + context/ (six files) committed (99250b5).
- Testnet deploy on Robinhood Chain (chain 46630), block 90901040:
  - BuffCatMiner: `0xEcd9e1E717D6628513E1E555702ED21a222872A5`
  - MockBuffcat:  `0xaBf15C76b8BB5493fb51DC5b8a625574486C5F67`
  - Owner/deployer (throwaway): `0x897D60882FE0d15cD81b6631462891Af38b3ef37`
- **Stock-Token transfer, IN-direction: PROVEN on testnet 2026-07-17.**
  Full sequence exercised via `cast` against the live contract:
  1. `approve` RH-TSLA (`0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E`) to miner — ok.
  2. `setFeatured(TSLA, ts)` — ok (emitted FeaturedSet).
  3. `lock(1000e18, tier 0, choice 2 FEATURED)` with 0.003 ETH fee — ok
     (positionCount → 1; note the send returned an RPC "null response" but the
     tx actually landed — verified by reading state).
  4. `setFeatured` again to PROMOTE the featured position → `featuredHashpower`
     went 0 → 1.3e21 (confirms the 1.3× featured bonus applied correctly).
  5. `fundFeatured(5e18)` → **status 1**, TSLA `Transfer` event you→contract for
     5e18. Real Stock Token moved into the contract via safeTransferFrom.
  - Test tx: `0xa9c7249e4d47afea57be5942c78c01920086f7e3ec9044f9c5c9e6a1508ecd59`
  - Proven with RH-TSLA, not RH-NVDA (NVDA not faucet-obtainable / not mintable
    on testnet), but Stock Tokens share one ERC-8056 impl, so this generalizes
    to NVDA.

## In Progress

- Step 5 testnet click-through. Done so far: lock, setFeatured, fundFeatured
  (all via cast). Remaining: claim, compound, unlock, early-exit, pause,
  setBuyFee; verify on Blockscout; a full-day soak.

## Next Up

- **Stock-Token OUT-direction:** featured `claim(posId)` doing safeTransfer of
  the Stock Token OUT to a user. The featured position (posId 0) must pass
  MIN_HOLD (24h from its lock) before dividends are claimable, then `claim(0)`.
  Do this before any live NVDA campaign — it closes the other half of the
  transfer-restriction question.
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
- Weekly featured rotation model: currently owner-triggered (pass block.timestamp
  as weekStart). Decide owner-manual vs off-chain keeper vs on-chain schedule.

## Architecture Decisions

- Flat ETH lock fee (buyFeeWei, 0.0005–0.05 ETH), NOT a % skim of BUFFCAT.
  100% of principal returned at unlock. Fee split 25/40/15/20.
- O(1) scaled-accumulator dividends; no price oracle (deliberate — less audit
  surface). Featured campaigns snapshot-gated (front-run resistant), 1.3× bonus.
- MIN_HOLD = 24h before any dividend accrues.
- Featured eligibility ordering: a featured-choice lock only becomes eligible
  at the NEXT setFeatured after it (featuredPending → featuredHashpower). So a
  fresh contract needs: lock(featured) → setFeatured → fundFeatured, in that
  order, or fundFeatured reverts FeaturedNotSet (featuredHashpower == 0).

## Session Notes

- Public testnet RPC (`rpc.testnet.chain.robinhood.com`) throws intermittent
  "null response" errors during gas estimation — the tx often STILL lands.
  Verify by reading state (positionCount, featuredHashpower, balances) before
  re-sending, and add `--gas-limit <n>` (e.g. 300000/500000) to bypass the
  estimation step that flakes. Consider a dedicated Alchemy endpoint for the
  full Step 5 click-through and for mainnet.
- KEY HANDLING: the original owner key (`0xc241…5596`) was exposed in the
  terminal during this session and rotated away from — do NOT reuse it; clear
  shell history (`cat /dev/null > ~/.zsh_history && exec zsh`). Testnet now uses
  a THROWAWAY (`0x897D…ef37`) stored in an encrypted cast keystore; reference it
  with `--account throwaway` (never `--private-key`). Verify with
  `cast wallet address --account throwaway` → 0x897D…ef37.
- Testnet Stock Tokens: faucet hands out TSLA/AMZN/PLTR/NFLX/AMD (5 each), NOT
  NVDA. RH-NVDA exists (`0xA916e8830d57cC9846E37859D90c24c5531e71c7`) but isn't
  faucet-obtainable or openly mintable — TSLA was used as the equivalent test.
- The Claude project mirror drifted from the repo repeatedly this session
  (stale mining.js, a never-committed BuffCatMiner_test.js, blank context
  templates). Re-upload context files via Project settings after repo changes;
  keep vendored libs out of it.
- The six context files were populated this session and committed, but must be
  RE-UPLOADED into Claude Project settings (they're still blank templates in the
  project mirror), and the read-order instruction pasted into Project custom-
  instructions, for the anti-drift system to actually load next session.
