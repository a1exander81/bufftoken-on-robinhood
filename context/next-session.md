# Next Session

Read `CLAUDE.md` for the context read order first. The git repo is the source
of truth — the Claude project mirror has gone stale repeatedly and was wrong
about `mining.js` three times on 2026-07-19. Verify against the repo.

`main` is at `b91e277`.

---

## Ritual status — TWO tracks running

### Track A — BuffCatMiner (original)

1. Design — **DONE**
2. Write the contract — **DONE**
3. Attack it — **DONE** (`forge test` 20/20, incl. 3 invariants at 128,000
   calls each, 0 reverts. Re-verified after every change on 2026-07-19.)
4. Slither — **DONE** (55 findings triaged, 4 fixed, rest accepted with reasons)
5. Testnet deploy + verify + click-through — **IN PROGRESS**
   - deployed: `0xEcd9e1E717D6628513E1E555702ED21a222872A5` (chain 46630)
   - Blockscout verified: DONE
   - exercised: `lock`, `setFeatured`, `fundFeatured`
   - **REMAINING: `claim`, `compound`, `unlock`, early-exit, `pause`,
     `setBuyFee`, and the Stock-Token OUT test (`claim(0)` after posId 0
     clears MIN_HOLD). Plus a full-day soak.**
6. Independent human audit — NOT STARTED
7. Mainnet + frontend — BLOCKED on 5 and 6

### Track B — Treasury vault (new, 2026-07-19)

1. Design — **IN PROGRESS.** `context/treasury-design.md` is written and
   merged, but the Step 1 GATE IS NOT MET. See "Blockers" below.
2-7. NOT STARTED

Do not start Track B Step 2 until the Step 1 gate in
`treasury-design.md` §11 is satisfied.

---

## Blockers before Track B Step 2

1. **Swap router address — HARD BLOCKER.** Not discoverable from the pool or
   the position manager (`positionManagerRouter()` is not exposed). Find it via
   Blockscout: open pool `0xde543192e1939Ee2538db77CCc225Aa67412bEa6`, find any
   recent swap, and the contract that called `swap()` is the router.
   ALTERNATIVE: call `pool.swap()` directly with a callback — removes the
   dependency entirely and gives exact slippage control. Decide which.
2. **Circulating-supply definition.** Currently `totalSupply - balanceOf(dEaD)`.
   The treasury will itself hold BUFFCAT, which sharpens the question: does
   circulating also exclude LP, team, or treasury holdings? Must match across
   contract, bot, and public comms. Expensive to change after publishing.
3. **Mainnet owner** — hardware wallet or multisig. Now gates a contract that
   will hold real value.
4. **Re-derive `VOLUME_THRESHOLD`.** The current 100 WETH is from 10 hours of
   data on a day price ran +25%. Get a full week first.
5. `architecture.md` needs the treasury in System Boundaries plus the
   invariant: "value leaves the treasury only to the pool, the miner's dividend
   function, or DEAD."

---

## First commands next session

Check the bot has a full week of data and re-derive the threshold:

    ssh root@156.67.221.224
    systemctl status buffcat-volume --no-pager
    journalctl -u buffcat-volume --since "7 days ago" > /tmp/vol.log
    grep -c "Total:" /tmp/vol.log

Then run the analyzer with HRS set to the real window length. It parses
`Buys:`/`Sells:` lines and reports raw, 70/30-weighted, daily rate, and the
threshold that yields a weekly cadence. If weighted volume comes back near
13.3 WETH/day, keep 100 WETH. If materially lower, drop the threshold and let
the 7-day fallback carry more of the load.

---

## Standing hazards (all bit us on 2026-07-19)

- **An empty diff after a write is a FAILURE signal, not a pass.** A `cp` from
  `~/Downloads` silently copied a stale file because the browser had saved the
  new one as `filename (1).md`. Always `ls -la ~/Downloads/<name>*` first and
  check `git diff --stat` is non-empty.
- **A squash merge locks the PR head.** Anything pushed to the branch after
  that is silently orphaned — the push succeeds, the PR ignores it. Verify a
  merge landed with `git show origin/main:<path>`, never by reading the PR.
- **The Claude project mirror is not the repo.** Re-uploading a context file
  ADDS a copy rather than replacing it; the stale one must be deleted by hand
  in Project settings. Its `mining.js` was three versions behind on
  2026-07-19. Keep only the `context/` docs in the mirror — no code.
- **Verify through a different mechanism than the one that reported success.**
  Five separate "success" reports were wrong on 2026-07-19; every one was
  caught by checking a second way.

---

## Also still open (pre-existing)

- `/mining` is live on `main` pointing at mainnet `0x1237` with
  `MINER_ADDRESS=""` — a dead public surface. Repointing to testnet 46630 also
  requires widening `connect-src` in `vercel.json`, currently mainnet-only.
- The dividend `choice` selector (ETH / USDG / featured) is not built; locks
  default to choice 0.
- `context/frontend-changes-v2.md` is written but **must not be merged** — it
  depends on `quoteFee()` and `feeBps()`, which do not exist. It belongs to the
  deferred v2 scope in `treasury-design.md` §9.
