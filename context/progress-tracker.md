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

## Session — Website restructure + main merge (2026-07-17)

### Completed
- Reorganized frontend into `web/{marketing,miner,shared}` with root-absolute
  paths; added vercel.json rewrites (`/` → marketing, `/mining` → miner) so
  URLs are preserved. Commit 0b83989. Vercel PR-preview built green.
- Corrected layout vs. original plan: buffcat-robinhood.css → shared (loaded by
  both pages), cat-drag.js → miner (miner-only).
- Merged website + miner into `main`. `BuffCatMiner.sol` had an add/add conflict
  (main's pre-Slither copy vs. our Slither-fixed branch); resolved to OUR version
  wholesale (carrying events UsdgDividendFunded + FeaturedFunded from 6adfc82).
  Verified staged contract by grep before commit.
- Gate: re-ran `forge test` post-merge = 20/20, 0 failed, incl. 3 invariants at
  128,000 calls each, 0 reverts. Merge disturbed no behavior.
- Remote `origin/main` landed the same content via GitHub PR #5 merge (9b8bd81);
  confirmed byte-identical to local (empty tree diff) — no force push, local
  fast-forwarded to match.

### Open (now live in prod)
- Mining page is live on main but points at mainnet (0x1237) where no contract
  is deployed — /mining reaches a dead address. Not a fund risk, but a broken
  public surface. Before promoting: repoint mining.js to testnet (chainId 46630)
  AND add https://rpc.testnet.chain.robinhood.com to vercel.json CSP
  `connect-src` (currently mainnet-only → testnet wallet calls would be blocked).
- Context files still blank templates in Claude Project mirror — re-upload via
  Project settings so next session loads them.

### Blockscout verification (2026-07-17)
- Testnet BuffCatMiner (0xEcd9e1E717D6628513E1E555702ED21a222872A5) VERIFIED via
  standard-JSON input (compiler v0.8.35+commit.47b9dedd, optimizer off).
- Confirmed deployed bytecode matches main source: byte-identical except the
  immutable constructor addresses, same trailing metadata hash. Source now public
  at explorer.testnet.chain.robinhood.com.
- Note: verified without manually pasting constructor args (Blockscout matched
  from the deployment tx / accepted as match). If a "full match" upgrade is ever
  wanted, re-verify with the ABI-encoded args appended.

## Session — Tokenomics & burn design decisions (2026-07-18)
Design/decision session only. NO code written, NO tests, NO deploys this session.

### Decided
- Fee/dividend model: KEEP existing BuffCatMiner (Synthetix-style fee-funded
  accumulator paying ETH/USDG/featured via Choice enum). It already meets the
  core goal. MasterChef (net2dev) model REJECTED — it mints an inflationary
  reward token (needs its own LP, dilutive), wrong for real-asset dividends.
- "$5 fee" clarified: no oracle wanted; fee stays ETH-denominated (flat, or a
  %). A hard USD peg would need a price feed — declined.
- Deflation: add a BURN. Manual/mechanized via a dedicated BURN VAULT contract
  (holds fee BUFFCAT, burn-only). Owner/keeper triggers; auto-burn kept keyless
  and rule-bound so no privileged hot key on any server.
- Burn params (from simulation): 0.25% of circulating per burn CAP + a WEEKLY
  frequency cap (threshold-primary, ~7-day fallback). Sim finding: per-burn %
  ALONE is unsafe — without a frequency cap it burns 68–100%/yr; weekly cap
  → ~12%/yr, volume-independent. Keep burns SMALL until liquidity deepens.
- Fairness of burns: NOT a schedule problem, a LIQUIDITY problem. On the ~$15K
  pool a $1k buy moves price ~34% (front-runnable); at ~$1M depth it's ~0.5%.
  Policy: full transparency + loud POST-burn comms, no precise PRE-burn timing.
- Owner ops: build a web ADMIN PANEL (owner wallet connects + signs; UI gated on
  reading owner() == connected wallet). Telegram bot DEFERRED (notify + one-tap
  sign later; never a full owner key on a server).

### Key facts established
- BUFFCAT token: MAINNET, immutable, at 0xD80...2036. Cannot add tax to it.
- BUFFCAT/WETH pool: ~$15.3K total (279.4M BUFFCAT + 3.53 WETH), price
  ~$0.0000318. Thin — the common blocker behind fairness, price stability, and
  any %-of-value fee ambition. Growing WETH-side liquidity is the real milestone.
- Robinhood Chain runs Uniswap v2/v3/v4 + hooks (chain id 4663 = 0x1237).
  A trade-tax would require a v4 hook + NEW hooked pool + liquidity migration —
  parked; not pursued now.

### NEXT (agreed order)
1. Write BURN VAULT contract (burn-only; 0.25% cap; weekly; threshold+fallback;
   Burned(amount,newSupply,timestamp) event for comms). Run full ritual:
   tests -> Slither -> testnet deploy -> Blockscout verify.
2. Web admin panel on top of deployed functions (miner setBuyFee/setFeatured/
   fund*/pause + vault burn).
3. Telegram console (notify + one-tap) — later.

### Still open from prior sessions (unchanged)
- Frontend still points at mainnet (0x1237), MINER_ADDRESS="" — repoint to
  testnet 46630 + set verified address + widen CSP connect-src.
- Stock-Token OUT test: claim(0) after posId 0 clears MIN_HOLD.
- Re-upload the six context files to Claude Project settings (blank in mirror).

## Session — Repo/context audit (2026-07-18)
Audit only. No contract code written, no tests run, no deploys. Findings below
verified by reading `main` at commit a266a6fb via the GitHub API/raw content.

### Verified
- `context/progress-tracker.md` IS current on `main` (commit a266a6fb,
  2026-07-18T04:06Z, "docs: capture tokenomics + burn vault design decisions").
  The 2026-07-18 tokenomics/burn session was recorded and pushed correctly.
- All eight `context/` docs exist and are populated on `main`, including
  `architecture.md` (3865 B) and `code-standards.md` (2517 B).

### Found broken — DUPLICATE CONTRACT (highest priority)
- Two files named `BuffCatMiner.sol` exist and they are DIFFERENT contracts:
  - `contracts/src/BuffCatMiner.sol` (20,141 B) — the real one. Contains
    `_ownerAddr`, `UsdgDividendFunded`, `FeaturedFunded`, `BuyFeeUpdated`
    (the Slither fixes from 6adfc82). Tested, deployed, Blockscout-verified.
  - `contracts/contracts/BuffCatMiner.sol` (18,561 B) — LEGACY. None of those
    markers. Different design: `Ownable2Step`, `Tier` enum, `notifyRewardAmount`,
    2% buy fee split 1% LP / 1% eco, on-contract LP ETH reserve. NOT deployed.
- This violates architecture.md's stated invariant that `contracts/src/` is the
  single source of economic logic.
- Aggravating factor: `contracts/hardhat.config.js` exists, and Hardhat's
  default source dir is `contracts/contracts/` — so any Hardhat run builds the
  WRONG contract. `contracts/foundry.toml` has `src = "src"`, so `forge` is
  correct. Also present and legacy: `contracts/scripts/deploy.js`,
  `contracts/scripts/simulate.js`, `contracts/test/BuffCatMiner.test.js`,
  `contracts/contracts/mocks/*.sol`.
- ACTION REQUIRED (decision): delete the legacy Hardhat set, or move it to
  `legacy/` with a README. Until resolved, it is a live footgun for any human
  or agent that greps for "BuffCatMiner.sol".

### Found broken — stale context docs (corrected versions drafted)
- `architecture.md` "System Boundaries" and `code-standards.md`
  "File organization" both still describe the PRE-restructure layout (frontend
  files at repo root). Actual layout since commit 0b83989 is
  `web/{marketing,miner,shared}`. `architecture.md` also mis-files `cat-drag.js`
  under marketing; it is miner-only.
- `code-standards.md` says `context/` holds "six context docs"; there are eight.

### Found broken — competing progress docs
- Root `PROGRESS.md` says "Last updated 2026-07-16, commit 2099c14, Status:
  Contract built + tested. **Not deployed.**" — contradicts reality (deployed
  + verified on testnet). Root `NEXT_SESSION.md` likewise duplicates
  `context/next-session.md`. Delete or reduce to pointers.

### Claude Project mirror (not a repo problem)
- Re-uploading a context file ADDS a copy; it does not replace the old one.
  Blank `[bracketed]` templates of `project-overview.md` and `ui-context.md`
  are still in the project knowledge index alongside the populated versions,
  and both are returned by search. They must be deleted by hand in Project
  settings. `architecture.md` and `code-standards.md` were never uploaded at
  all — upload them.

### Open Questions added
- Delete vs. quarantine the legacy Hardhat/contract set? (Deleting is cleaner;
  quarantining preserves history. Either way it must stop being reachable by a
  default `npx hardhat` invocation.)
- Should root `PROGRESS.md` / `NEXT_SESSION.md` be deleted outright, given
  `MINING_GUIDE.md` (public-facing) also lives at root?

### Resolved this session
- Legacy Hardhat set QUARANTINED to `legacy/` (commit 5f05020): the superseded
  BuffCatMiner.sol, contracts/mocks/, both hardhat.config files, scripts/, and
  BuffCatMiner.test.js. All 11 recorded by git as 100% renames (no content
  change) + legacy/README.md. Gate: `forge build && forge test` after the move
  = 20/20 passed, 0 failed, 3 invariants at 128,000 calls each, 0 reverts.
  Foundry path unaffected (`contracts/foundry.toml` src = "src").
- Open question "delete vs quarantine" → answered: quarantine (history kept,
  no longer reachable by a default `npx hardhat` run).

### Stale-doc cleanup (2026-07-18, PR docs/retire-stale-docs)
- `contracts/README.md` listed the EXPOSED+ROTATED key address
  `0xc2413696576176d1e31D55a2DEdA609906a15596` as "Deployer/Owner". Removed.
  README now documents the throwaway `0x897D...ef37` and states the mainnet
  owner is an open decision (hardware wallet / multisig required).
- Same README also documented `src/PriceGuard.sol.unused` (file does not exist
  on main), pointed at "chat history" for wiring, and instructed
  `forge init . --force` inside an initialized project. All removed.
- Root `PROGRESS.md` / `NEXT_SESSION.md` reduced to pointers at `context/`.
- Orphaned `package.json` / `package-lock.json` (hardhat, hardhat-toolbox,
  solc devDeps) moved to `legacy/`. Gate: forge test 20/20, 0 failed,
  3 invariants at 128,000 calls, 0 reverts.
