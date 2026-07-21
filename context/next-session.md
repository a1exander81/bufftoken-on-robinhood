# Next Session

Read `CLAUDE.md` for the context read order first. The git repo is the source
of truth — verify against it, not the Claude project mirror.

`main` is at `530a3e3` (docs: close Track B step 1 gate; record v2 + seeding
design, 2026-07-20).

---

## Ritual status — THREE tracks

### Track A — BuffCatMiner v1 (deployed)

1. Design — **DONE**
2. Write the contract — **DONE**
3. Attack it — **DONE** (`forge test` 20/20, 3 invariants at 128,000 calls, 0 reverts)
4. Slither — **DONE** (55 findings triaged, 4 fixed, rest accepted with reasons)
5. Testnet deploy + verify + click-through — **IN PROGRESS**
   - deployed `0xEcd9e1E717D6628513E1E555702ED21a222872A5` (chain 46630)
   - Blockscout verified: DONE
   - exercised: `lock`, `setFeatured`, `fundFeatured`
   - **REMAINING: `claim`, `compound`, `unlock`, early-exit, `pause`,
     `setBuyFee`, and the Stock-Token OUT test (`claim(0)` once posId 0 clears
     MIN_HOLD). Plus a full-day soak.**
6. Independent human audit — NOT STARTED
7. Mainnet + frontend — BLOCKED on 5 and 6

> **If Track C proceeds, all of Track A Step 5 is thrown away.** v2 is a new
> contract; this deploy is superseded. Do not spend a session finishing the
> click-through before the sequencing decision is made.

### Track B — Treasury vault

1. Design — **Step 1 gate: 4 of 5 items closed** (2026-07-20). One blocker
   remains, see below. `context/treasury-design.md` §11.
2-7. NOT STARTED

### Track C — BuffCatMiner v2 (new, 2026-07-20)

1. Design — **DRAFTED**, `context/miner-v2-design.md`. Multi-pool `allocPoint`,
   three-tier program, single-sided ETH seeding round, streamed rewards.
   Sandbox-compiled and the distribution math simulated (7 groups, 5,000-op
   solvency fuzz) — **not a ritual step, not Foundry**.
2-7. NOT STARTED

---

## The one hard blocker

**Pool `observationCardinality` = 1.** Verified 2026-07-20 via `slot0()` on
`0xde543192e1939Ee2538db77CCc225Aa67412bEa6`.

The pool stores a single price observation and no history. `treasury-design.md`
§4 requires spot within `MAX_DEVIATION_BPS` of a **30-minute TWAP** before any
swap — `observe()` over that window **reverts** against this pool. As designed,
every `swapEth()` would revert. Fails safe; the vault would be inert.

Blocks Track B Step 2 and, because v2 swaps too, anything that swaps at all.

Fix and why it is not instant:

- `increaseObservationCardinalityNext(N)` is **permissionless**, ~20k gas per
  slot, no ownership needed.
- It creates EMPTY slots. They fill one at a time as trades occur, and 30
  minutes of real elapsed time must pass before an average exists.
- **Start this early.** It is the only outstanding item with an unavoidable
  waiting period.

Sizing needs measurement first: count DISTINCT BLOCKS CONTAINING A SWAP per
30-minute window, take the busiest, multiply by 3-4 for headroom. Blocks here
are ~0.113s, so the count may be high. Guessing is the wrong move — too few
slots and the guard breaks intermittently, which is worse than breaking always.

---

## The one open decision

**Sequencing: Track C now, or Track B on top of v1 first?**

| | Track C now | v1 + treasury first |
| --- | --- | --- |
| Restart cost | once, before anything is live | later, with live positions to migrate |
| Time to something shipped | longer | shorter |
| Track A Step 5 work | discarded | preserved |

Not decided. `miner-v2-design.md` §10.

---

## First commands next session

Size the cardinality fix. Add to the volume bot, then read a day of it:

    ssh root@156.67.221.224
    systemctl status buffcat-volume --no-pager
    journalctl -u buffcat-volume --since "24 hours ago" > /tmp/v24.log
    python3 /tmp/an.py /tmp/v24.log

The analyzer parses `Buys:`/`Sells:` lines and reports raw, 70/30-weighted, the
daily rate, and coverage. **`grep -c "Total:"` is NOT the sample count** — the
bot prints no `Total:` block for zero-volume intervals, and using it as the
denominator overstated the rate by 40% on 2026-07-20.

Bot change needed for the cardinality work: log distinct blocks-with-swaps per
30-minute window.

Mainnet reads:

    R=https://rpc.mainnet.chain.robinhood.com
    cast call 0xde543192e1939Ee2538db77CCc225Aa67412bEa6 \
      "slot0()(uint160,int24,uint16,uint16,uint16,uint8,bool)" --rpc-url $R

Fields 3 and 4 are `observationCardinality` and `observationCardinalityNext`.
Both were 1 on 2026-07-20.

---

## Also open

- **Router source review.** UniversalRouter
  `0x8876789976decbfcbbbe364623c63652db8c0904` is verified and immutable, but
  integration docs describe it as a modified fork carrying an extra
  `minHopPriceX36` field in the v4 swap struct. Our pool is V3 and the standard
  callback selector is present, so the V3 path is probably untouched — read the
  verified source and confirm `V3_SWAP_EXACT_IN` encoding before Step 2.
  Fallback: direct `pool.swap()` with a `msg.sender == POOL` guard.
- **Qualified advice on the seeding round** before accepting any deposit.
  Robinhood Chain is adjacent to tokenised equities.
- **Treasury BUFFCAT commitment cap** for the seeding round — bounds the IL the
  treasury absorbs. Fees stop covering IL at 5.8x; BUFFCAT moved 7x in 42 hours
  on 2026-07-18/19.
- **`treasury-design.md` §1 crossover table** assumed ~100% of lock fees
  reaching the treasury; the contract sends 25%. Re-run before external use.
- **Uniswap V3 LP positions are NFTs.** Track C pool 1 needs a
  MasterChefV3-style design, not ERC-20 staking. V3 fees also do not
  auto-compound — `collect()` must be called, and should be permissionless.
- `/mining` is live on `main` pointing at mainnet `0x1237` with
  `MINER_ADDRESS=""` — a dead public surface. Repointing to testnet 46630 also
  needs `connect-src` widened in `vercel.json`.
- The dividend `choice` selector (ETH / USDG / featured) is not built; locks
  default to choice 0.
- `context/frontend-changes-v2.md` **must not be merged** — it depends on
  `quoteFee()` and `feeBps()`, which do not exist.
- `context/session-runbook.md` is **stale**: it routes through
  `feature/buffcat-miner`, the website restructure, and CodeRabbit setup, all
  of which are done. Rewrite or retire.
- Bot fixes (non-blocking): log `sellsWeth` from `sqrtPriceX96`; skip the first
  cycle after restart; emit `Total:` on quiet intervals; relabel `USDG` ->
  `USD` on the burn card.

---

## Standing hazards

- **An empty diff after a write is a FAILURE signal, not a pass.** Check
  `ls -la ~/Downloads/<name>*` for `(1)` duplicates first, and confirm
  `git diff --stat` is non-empty.
- **A squash merge locks the PR head.** Anything pushed after is silently
  orphaned. Verify with `git show origin/main:<path>`, never by reading the PR.
- **The Claude project mirror is not the repo.** Re-uploading a context file
  ADDS a copy; the stale one must be deleted by hand. Keep only `context/`
  docs plus `CLAUDE.md` in the mirror — no code.
- **Verify through a different mechanism than the one that reported success.**
  This fired twice on 2026-07-20: a buy/sell split extrapolated from two log
  lines was wrong across 500 samples, and the first contract sampled from the
  pool was an upgradeable look-alike, not the router.
- **A hash mismatch is not proof of different code.** Contracts with immutables
  (Permit2, Uniswap routers) legitimately differ per chain. Diff the bytes:
  canonical Permit2 differed from Ethereum's in 39 bytes out of 9,152.
- **Snapshots are not constants.** The "108,092,328 already burnt" figure was a
  mid-flight reading of a live third-party burn programme, recorded as a fixed
  fact. Date-stamp every on-chain reading.
