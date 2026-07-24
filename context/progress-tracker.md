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


## Session — Burn vault research + volume telemetry (2026-07-18)
Research/telemetry session. No contract written, no ritual step advanced.
All figures below read from mainnet (chain 4663) via `cast` or the bot.

### VERIFIED ON-CHAIN
- **BUFFCAT has NO burn function.** Source at `0xD80a...2036` is a launchpad
  `LaunchToken` inheriting plain OZ `ERC20` — not `ERC20Burnable`. No `burn`,
  no `burnFrom`, no exposed `_burn`. Supply minted once in the constructor;
  `totalSupply()` can never decrease.
  => Burns MUST go to `0x000000000000000000000000000000000000dEaD`.
  => `Burned` events must report CIRCULATING (total - dEaD), never
     `totalSupply()`, which sits frozen at 1B forever.
  This closes the Option A / Option B question. It is Option B.
- **Total supply = 1,000,000,000 BUFFCAT** (`totalSupply()`). Confirms the
  figure every prior simulation assumed.
- **108,092,328 BUFFCAT (10.8092%) is ALREADY at `0x...dEaD`** — a pre-existing
  burn, not zero as assumed. Circulating = 891,907,672. Via `balanceOf`.
- **Pool is Uniswap V3**, `0xde543192e1939Ee2538db77CCc225Aa67412bEa6`,
  resolved via `LaunchToken.liquidityPool()`. Fee tier **10000 (1%)**, NOT the
  0.3% earlier estimates assumed. `token0 = WETH`, so feeGrowthGlobal0 = BUYS
  and feeGrowthGlobal1 = SELLS (V3 charges the fee on the INPUT token).
- **A contract CAN read swap volume on-chain, via fee-growth deltas.** Volume
  is not stored by any pool and contracts cannot read event logs, but V3
  exposes monotonic fee accumulators in storage:
      volume = (deltaFeeGrowth * liquidity / 2^128) * 1e6 / fee
  PROVEN: two consecutive reads with liquidity unchanged recovered a buy of
  exactly 0.03000000 WETH (fee 0.0003 = 1%). Exact, not approximate. No oracle,
  no keeper, no hook, no change to BUFFCAT.
  CAVEAT: accurate only while in-range liquidity is stable across the interval.
  A lifetime computation (current L vs 16 days of growth) is unreliable.

### MEASURED (2026-07-18, ~67 min of sampled 5-min windows)
- raw ~$4,880 / 67 min -> ~$105,000/day (56.8 WETH/day)
- split 61.9% buys / 38.1% sells
- 70/30 buy-weighted = 54.8% of raw = **31.1 WETH/day weighted**
- Price moved $0.00006145 -> $0.00007693 (+25%) during the sample, so this is
  likely an ACTIVE-day upper bound. PROVISIONAL pending 24-48h.

### DESIGN DECISIONS (supersede earlier assumptions)
- **Burn everything in the vault**, weekly, above a dust floor. The earlier
  0.25%-of-supply cap was designed against a TAX-funded model that does not
  apply: every token in the vault is BOUGHT at market with real ETH, so a
  buyback-and-burn cannot over-burn. Keep a ~2%/burn emergency ceiling as a
  circuit breaker only.
- **Trigger = weighted volume primary, time fallback:**
      canBurn = vaultBalance >= DUST_FLOOR
                && (weightedVolume >= VOLUME_THRESHOLD
                    || now >= lastBurnAt + FALLBACK_INTERVAL)
- **Weighting 70% buys / 30% sells.** Sells are BUFFCAT-denominated, converted
  to WETH via the pool's own `sqrtPriceX96` (no oracle). Weights and threshold
  owner-settable within bounds.
- **VOLUME_THRESHOLD ~ 220 WETH weighted** => ~weekly at measured activity;
  14d if volume halves (fallback covers it), 3.5d if it doubles.
  PROVISIONAL — derived from 67 minutes. Re-derive from 24-48h.
- Threshold in WETH, never USD — preserves the no-oracle rule.
- KNOWN/ACCEPTED: `sqrtPriceX96` is spot and flash-loan manipulable in-block.
  Worst case triggers a burn slightly early on whatever the vault holds. No
  value at risk; not worth engineering around.

### BUILT (telemetry only — no funds at risk, not part of the ritual)
- Read-only Telegram bot on VPS (systemd `buffcat-volume`, user `buffbot`, no
  wallet/private key). `/vol`, `/burn`, `/tg`. Hourly burn card.
- Committed to `bots/volume/`. `.env` gitignored; `.env.example` tracked.

### OPEN QUESTIONS — MUST be resolved before Step 1 (Design)
1. **Vault funding path.** The 25% buyback share is ETH and goes to the
   immutable `buybackWallet`. Manual forward to the vault, or redeploy
   BuffCatMiner to point at it? (Redeploy = new contract, fresh forge test +
   Slither + testnet + verify.)
2. **Who executes the ETH -> BUFFCAT swap?** Off-chain by prior decision (no
   router calls in-contract, MEV). Manual, or a keyed keeper? A keeper needs a
   hot key, which prior sessions ruled out.
3. **Definition of circulating.** Currently total - dEaD. Also exclude LP,
   team, treasury? Must be consistent across contract, bot, and comms.
4. **Route the BUFFCAT-denominated fees (2% compound, 15% early-exit) to the
   vault?** They are price-INVARIANT and would give a deflation floor that does
   not erode as price rises. Same redeploy question as (1).
5. **Final VOLUME_THRESHOLD** — pending 24-48h of measured volume.

### Verified V3 stack (2026-07-19, chain 4663)
- Factory:          0x1f7d7550B1b028f7571E69A784071F0205FD2EfA
- PositionManager:  0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3 (~24.4KB, factory()
                    and WETH9() both check out — standard NFPM)
- Pool (1% tier):   0xde543192e1939Ee2538db77CCc225Aa67412bEa6
- token0 = WETH 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73
- token1 = BUFFCAT 0xD80aFe3Be875a14155FDd96D39669A6734E12036
- NOT canonical Uniswap — fork deployment. Uniswap doc addresses are WRONG here.
- Swap router: still unidentified. Find via Blockscout (caller of pool.swap), or
  skip it by calling pool.swap() directly with a callback.
## Session — Step 1 gate closure + v2 design (2026-07-20)

Verification and design session. **No contract code written, no ritual step
advanced, no deploys.** Every figure below read from chain 4663 or 46630 via
`cast`, or from the volume bot. Sandbox compilation is not a ritual step.

### Gate §11 — all four open questions closed on evidence

**OQ 1 — Swap route: RESOLVED. UniversalRouter + Permit2.**
- First candidate found on the pool, `0x65050a9b7e5075a2ba5ced7b1b64ee66262c40dc`,
  is **NOT a router**: 752 bytes, `factory()` and `WETH9()` both revert,
  Blockscout name `TransparentUpgradeableProxy`, implementation slot
  `0x7e206578bf12dcb1102d5cdde5c6280fafc4109c`, admin slot
  `0x75fc5cd1794921e617d97e4afa2ff93613413be3` (a contract, 872 bytes).
  It is an upgradeable look-alike. Third-party integration docs for this chain
  independently warn that router look-alikes exist here.
- **Canonical router: `0x8876789976decbfcbbbe364623c63652db8c0904`.**
  24,546 bytes; proxy implementation slot **all zeros (immutable)**;
  `execute` (both overloads) and `uniswapV3SwapCallback` selectors present;
  Blockscout **verified, name `UniversalRouter`**. Found by scanning Permit2
  `Approval` logs — 2,998 approvals, ~6x the next address.
- **Permit2 confirmed canonical** at `0x000000000022D473030F116dDEE9F6B43aC78BA3`:
  identical length to Ethereum mainnet (9,152 bytes), **39 differing bytes**
  (domain separator ~32 + chain-id low bytes ~3). Immutables, not different code.
- Decision: use the router with **exact-amount, short-expiry Permit2
  allowances**. Never a max approval.
- Condition before writing code: read the verified source and confirm the
  `V3_SWAP_EXACT_IN` encoding matches upstream. Integration docs describe this
  router as a modified fork carrying an extra `minHopPriceX36` field in the v4
  swap struct. Our pool is V3 and the standard callback selector is present, so
  the V3 path is likely untouched — verify, do not assume. Fallback if modified:
  direct `pool.swap()` with a guarded callback.

**OQ 2 — Circulating supply: RESOLVED, definition unchanged and complete.**
- `balanceOf(0x0)` = **0**. No burns to the zero address, so
  `circulating = totalSupply() - balanceOf(dEaD)` has no gap.
- Treasury holdings are **disclosed separately** via a `treasuryHeld()` view,
  never netted out of circulating. Netting would make the supply figure drop on
  days nothing was burned.

**OQ 3 — Mainnet owner: RESOLVED (revised).**
- Safe **verified available** on chain 4663: singleton 1.4.1
  `0x41675C099F32341bf84BFc5382aF534df5C7461a` (23,579 B), factory 1.4.1
  `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67` (3,054 B), 1.3.0 pair present,
  deterministic deploy proxy present (69 B).
  Bytecode keccak **identical to Ethereum mainnet** for both 1.4.1 contracts.
  `VERSION()` returns `1.4.1`.
- **Superseded by owner decision: single-key EOA (Rabby) owns both
  `BuffCatMiner` and the treasury.** Rationale: six years incident-free,
  Rabby's pre-signature simulation, and PURRGE/HYPURR timing is discretionary
  and latency-sensitive.
- Accepted risks, explicit:
  1. Single point of failure; no rotation without redeploying the miner.
  2. Miner blast radius — a compromised key can `setFeatured`, `setBuyFee`,
     `fund*`, `pause`, i.e. reroute reward flow. Higher-value exposure than the
     treasury.
  3. Treasury blast radius bounded by invariant 8 (destination allowlist). A
     stolen key can mistime burns; it cannot extract.
- Mitigations retained: `rescuePurrge()` after 180 days of owner silence;
  `MAX_SWAP_BPS`, `MIN_SWAP_INTERVAL`, `MAX_DEVIATION_BPS`.
- **Deployer != owner still binds.** Deploy with the throwaway; pass Rabby's
  address as the `owner` constructor argument.
- Safe remains deployed and verified here; migration later needs no contract
  change.

**OQ 4 — `VOLUME_THRESHOLD`: RESOLVED at `100e18`, unchanged, better supported.**
- Four measurement windows: 13.3 / 27.7 / 31.1 / **43.2** weighted WETH/day —
  a **3.3x spread**. No stable baseline exists to tune against.
- 100 WETH fills in 2.3 days at the current rate, 3.6 days at 27.7, and ~7.5
  days at the quietest observed — degrading into the 7-day fallback rather than
  going dead. Nothing else in the observed range does both.
- Reasoning reversed mid-session: an earlier recommendation to err high (200)
  assumed the threshold was the trigger. With PURRGE owner-gated, a threshold
  above ~7 days of volume never fires and the fallback opens the gate first.
- Owner-settable within bounds. Re-derive after a quiet week.

### Volume measurement — method correction

- `grep -c "Total:"` **undercounts the denominator**: the bot prints no `Total:`
  block for zero-volume intervals. 140 quiet + 359 headers = 499 samples.
- Correct 42.1h window: **2,524 min covered against a 2,509 min wall-clock
  span — effectively 100%**, no meaningful downtime.
- Using the 360 `Total:` samples would have given 73.9 raw / 38.9 weighted
  WETH/day and a 272 WETH threshold. True: 52.67 / 27.72 / 194.
  **The denominator alone was a 40% overstatement.**
- 24h window (288 samples, 1,440 min, zero price-failure samples):
  raw 82.50, weighted **43.16** WETH/day, buy share 55.8%.
- A single earlier claim that buys had collapsed to ~1.3% of flow was wrong —
  extrapolated from two log lines. Actual buy share 55.8% across 500 samples.
  Standing hazard "verify through a different mechanism" fired again.

### On-chain state, 2026-07-20 (chain 4663)

| | |
| --- | --- |
| `sqrtPriceX96` | 1.859e32, tick 155,221 -> ~5,506,000 BUFFCAT/WETH |
| Price | ~$0.00033643 (down ~21% from the afternoon read) |
| Pool WETH | 16.47 (~$30,500) |
| Pool BUFFCAT | 77,488,559 (~$26,100) |
| Pool total | **~$56,600** |
| **`feeProtocol`** | **0** — no protocol skim; all volume figures are accurate |
| **`observationCardinality`** | **1** — see blocker below |
| Implied ETH/USD | ~$1,852 (bot median $1,846; Blockscout $1,867.89) |

### NEW BLOCKER — pool observation cardinality

`observationCardinality = 1`. The pool stores **one** price observation and no
history. `treasury-design.md` §4 requires spot to sit within
`MAX_DEVIATION_BPS` of a **30-minute TWAP** before any swap; `observe()` for a
30-minute window **reverts** against this pool. As designed, every `swapEth()`
would revert on the guard — fails safe, but the vault would be inert.

- Fix: `increaseObservationCardinalityNext(N)` — permissionless, ~20k gas per
  slot, no ownership needed.
- **Not instant.** It creates empty slots that fill only as trades occur, and
  30 minutes of real elapsed time must pass before an average exists. Must
  happen well ahead of deployment.
- Sizing needs measurement: count distinct blocks containing a swap per 30-min
  window, take the busiest, multiply by 3-4 for headroom. Add to the bot.
- **This must be added to `treasury-design.md` §11 as a gate item.** It was not
  there, and it invalidates a design decision the document treats as settled.

### CORRECTION — the 108,092,328 "already burnt" figure is not a constant

Full `Transfer`-to-`dEaD` scan of chain history, chunked 500k blocks:

- **34 burn events**, blocks 860,710 -> 14,400,566.
- **Every one from the same contract**, `0x9eFdC1A8e6E94f16A228e44f3025E1f346EE0417`.
- Cumulative at block 11,868,580 = **108,092,327** — precisely the figure
  recorded on 2026-07-18 as a pre-existing constant. It was a mid-flight
  snapshot of a live programme.
- Current `dEaD` balance **116,310,332.925** (bot displays 116,310,333 —
  matches exactly). Circulating **883,689,667**. **+8,218,005 burned in ~48h.**
- Burner: 7,725 bytes, unverified, not a proxy, **BUFFCAT balance zero** (burns
  everything it receives, atomically — in and out in the same block).
  **29.788 ETH** held (~$55,600). Owner == creator ==
  `0x7E035Fb048a31e0481b88074557415b1C187242B` (an EOA). Created block 659,727.
- Source of its BUFFCAT: `0x7f03effbd7ceb22a3f80dd468f67ef27826acd85` —
  **Blockscout-verified, name `LaunchLocker`**. The launchpad locked the launch
  liquidity; those LP fees fund an automatic buyback-and-burn.
- **Nobody on the team built or maintains this.** Running since ~1 day after
  launch, averaging ~6.1M BUFFCAT/day.

Consequences:
1. **Invariant 5 must be rewritten.** It hardcodes 108,092,328 as the excluded
   baseline. Express it as an internal counter incremented only by this
   contract's own burns, with any `dEaD` baseline snapshotted at construction.
2. Website and bot must show **`totalPurrged` separately from the `dEaD`
   balance**. 116.3M (13% of supply) is the launchpad's, not ours.
3. Every "already burnt" figure in the docs needs a date stamp.
4. `treasury-design.md` §1's premise partly overlaps something already running
   at larger scale. The **burn** half of the treasury is out-scaled; the
   **dividend** half is not — nothing routes LP fees to `fundEthDividends`.

### Design decisions taken

- **PURRGE / HYPURR** replace the generic burn scope. Both owner-gated:
  `setArmed(bool)`, `purrge()`, `hypurr(bytes32 tag)`, all `onlyOwner`.
  `rescuePurrge()` permissionless after **180 days** of owner silence
  (anti-brick only; unreachable while the owner is active — and load-bearing
  now that ownership is single-key with no withdrawal path).
  `fundDividends()` and `collectFees()` stay permissionless.
- HYPURR sizing: `HYPURR_SWAP_BPS` **300** (3% of reserves) and
  `HYPURR_VAULT_BPS` **5000** (50% of vault), whichever is smaller;
  `HYPURR_INTERVAL` 7 days. PURRGE stays at `MAX_SWAP_BPS` 50 (0.5%).
  Rationale: past ~5% of reserves, slippage on this pool outweighs tokens
  gained. Both expressed in bps so they scale with pool depth.
- Gas: on an Orbit L2, calldata dominates and execution is cheap. Structural
  wins only — pack mutable state into one slot, immutables for every address,
  custom errors, `bytes32` tags, cache `slot0()`. **No assembly or inlined
  maths**; audit clarity outranks cents.
- Comms: **no fixed or "up to" APY.** The rate is
  dividends / TVL, and TVL is cumulative while the pot is not — the same
  product falls ~50x over a year at a steady lock rate. Publish a **live rate
  plus the historical range**.

### v2 design drafted

See `context/miner-v2-design.md`. Multi-pool `allocPoint` structure, three-tier
program, single-sided ETH seeding round, streamed rewards. Sandbox-compiled
(solc 0.8.24 + OZ 4.9.6, 13,812 bytes, zero warnings) and the distribution math
simulated across 7 test groups including a 5,000-op solvency fuzz.
**Not a ritual step and not a substitute for Foundry.**

Key finding driving the seeding structure: **fees stop covering impermanent
loss at 5.8x**, and BUFFCAT moved 7x in 42 hours this week. 50/50 LP seeding
punishes exactly the bullish holders it would recruit. Single-sided ETH seeding
places the IL on the treasury, where it is benign.

### Open questions added

1. **Sequencing: v2 now, or v1 + treasury first?** v2 restarts Track A at
   Step 2 and supersedes the current testnet deploy. Not decided.
2. Uniswap V3 LP positions are **NFTs** — staking them needs a
   MasterChefV3-style design, not ERC-20 staking.
3. Treasury BUFFCAT commitment cap for the seeding round.
4. Whether the seeding round constitutes an offering — **qualified advice
   required before accepting any deposit.**
5. `treasury-design.md` §1 crossover table assumed ~100% of lock fees reaching
   the treasury; the contract sends 25%. Re-run before external use.

### Housekeeping

- `CLAUDE.md` read order still lists **six** context docs; there are now ten.
- Project mirror was **in sync** with `main` this session — `architecture.md`,
  `treasury-design.md`, and `next-session.md` byte-identical to
  `raw.githubusercontent.com/.../main`. First session without drift.
- `context/burn-vault-design.md` confirmed **404 on `main`** — §11 gate item 2
  satisfied.
- Bot fixes (non-blocking): log `sellsWeth` from `sqrtPriceX96` so bot and
  contract measure the same instrument; skip the first cycle after restart
  (one zero-price sample observed, 0.26% of volume invisible); emit `Total:`
  on quiet intervals so the denominator is honest; relabel `USDG` -> `USD` on
  the burn card; add distinct-blocks-with-swaps per 30-min window for
  cardinality sizing.

## Session — PFP maker (2026-07-24)
Frontend only. No contract work, no ritual step advanced.

- Shipped `/pfp` (PR #18, main 7faaa11): Konva 9.3.6 vendored, 11 gear pieces,
  5 backgrounds incl. transparent, 1000x1000 export, share-to-X via Web Share
  API with download fallback, randomize / undo / layer order / circle-crop
  preview. Responsive stage 240-520px; export size is independent of display.
- Files: `web/pfp/{pfp.html,pfp.js,pfp.css}`, `assets/gear/*.png`,
  `assets/buffcat-body.png`, `vendor/konva-9.3.6.min.js`, `/pfp` rewrite.
- Gear PNGs are TRIMMED to bounding box. Originals were 600x200 with up to 74%
  transparent padding, which put the rotation pivot off the artwork. The
  `at`/`scale` values in pfp.js are calibrated to the trimmed sizes — do not
  swap the originals back in.
- Body art has 3px headroom above the ears and 0 bottom margin, so it is drawn
  at 86% inset (BODY_SCALE/BODY_X/BODY_Y). If re-exported with padding, set
  those to 1/0/0.
- `buffcat-robinhood.css` styles bare `section` with 84-150px padding and `h2`
  with clamp(30px,4.6vw,58px). Both leak into any new page using those tags;
  pfp.css carries scoped resets. Worth knowing before building another page.
- Outstanding art: `gloves.png` never supplied; `earring.png` has a small stray
  element near the hoop (~4% of its pixels, connected so not trimmable).
