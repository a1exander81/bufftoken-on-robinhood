# Treasury Vault — Step 1 Design

Status: **Step 1 (Design) — for review.** No Solidity written.
**Supersedes `burn-vault-design.md`**, whose central premise (a standalone
burn-only vault) was replaced during the 2026-07-19 session.

Decision: **Path 1 — treasury only.** `BuffCatMiner.sol` keeps its current
tiers, fee model, and fee splits. The one miner change is making
`fundEthDividends` permissionless. Tier caps, dynamic fees, and fee re-routing
are deferred to v2 (§9) — they are improvements to a product that is not live
yet, and they would restart the miner at Step 2.

---

## 1. The problem this solves

Miner dividends are funded by lock fees. Lock fees come from new lockers.
So existing lockers are paid by later lockers, and if locking slows, yield
goes to zero. Not fraudulent — principal is always returned, nothing is
promised, the fees are real revenue — but the yield is structurally dependent
on recruitment.

A treasury that owns liquidity earns from **traders**, who trade whether or not
anyone new locks. Route that income into the existing dividend accumulator and
yield survives a dead recruitment pipeline.

> **CORRECTION (2026-07-20).** The crossover model below assumed ~$271/week
> reaching the treasury, which is ~100% of lock-fee revenue. The contract sends
> the 25% buyback share, ~$69/week. The real timeline is ~3-4x longer than
> stated. **Re-run this table before any external use.**
>
> Separately: the BURN half of this design is out-scaled by the launchpad's
> existing automatic buyback-and-burn (§3). The DIVIDEND half is not — nothing
> currently routes LP fees into `fundEthDividends`. That remains the purpose.

### Measured basis for the claim

Simulated 2026-07-19 from on-chain figures (§3):

| Locks/wk | LP fees overtake lock fees | Treasury pool share @ wk52 |
| --- | --- | --- |
| 20 | week 20 | 29.5% |
| 50 | week 21 | 44.5% |
| 100 | week 23 | 55.2% |

Crossover lands at week 20-23 across every rate tested, with no external
capital — the treasury is funded entirely by recycled fees.

The treasury needs less than it sounds. Total LP fees across all LPs are
~$3,452/week at measured volume, against miner obligations of ~$277/week at
50 locks/week. Required share: **8.0%**, about **$1,901**, reachable in ~7
weeks at that lock rate.

### No ceiling (corrected)

An earlier version of this model held trading volume constant while scaling
lock rate, and concluded 500 locks/week needed 80% of the pool and 1,000 was
impossible. That was wrong: **locking IS trading.** Every locker buys BUFFCAT
first and most sell after unlock, so each lock cycle generates roughly two
trades. Corrected, at $500 average position:

| Locks/wk | Locker-driven volume | Share needed | Treasury size |
| --- | --- | --- | --- |
| 50 | $50k/wk | 7.0% | $1,642 |
| 500 | $500k/wk | 32.8% | $10,621 |
| 1000 | $1.0M/wk | 41.2% | $15,254 |
| 2000 | $2.0M/wk | 47.2% | $19,509 |

It converges just under half the pool instead of breaking. At 500 locks/week
lockers would be 59% of all trading — the miner becomes the market.

Position SIZE matters far more than position COUNT. At 500 locks/week: a $100
average needs 62% of the pool, $500 needs 33%, $2,500 needs 10%.

## 2. Why the dividend mechanism needs no new code

`BuffCatMiner` already implements the O(1) scaled-accumulator dividend pattern
(one global `accXPerShare` plus a per-position debt term), keyed on hashpower.
Verified numerically 2026-07-19 with an independent implementation:

- exact proportional splits
- late joiners earn nothing retroactively
- transfers/changes do not move accrued dividends
- across 500 randomised operations: 5 wei of rounding dust, and the accumulator
  **never owed more than it received** (solvency holds)

The treasury does not need its own distribution logic. It collects LP fees and
calls the miner's existing `fundEthDividends()`.

**The blocker:** `fundEthDividends` is `onlyOwner`. It must become
permissionless so the treasury can fund dividends without owning the miner.
This is safe by construction — the only thing a caller can do is give lockers
money. There is no attack in donating to a dividend pool.

## 3. Verified on-chain facts (chain 4663, 2026-07-18/19)

| Thing | Value |
| --- | --- |
| BUFFCAT | `0xD80aFe3Be875a14155FDd96D39669A6734E12036` |
| Total supply | 1,000,000,000 (immutable, minted once) |
| Burnt at `0x…dEaD` | **116,310,333 as of 2026-07-20 — a DATED READING, not a constant.** A third-party burner funded by the launchpad's `LaunchLocker` has run 34 burns since block 860,710 and continues (~6.1M/day). The 108,092,328 recorded 2026-07-18 was this same programme mid-flight, not a genesis burn. |
| Circulating | 883,689,667 as of 2026-07-20 |
| V3 factory | `0x1f7d7550B1b028f7571E69A784071F0205FD2EfA` |
| Position manager | `0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3` (~24.4KB, `factory()` and `WETH9()` both verified) |
| Pool | `0xde543192e1939Ee2538db77CCc225Aa67412bEa6` |
| Fee tier | 10000 (**1%**) |
| token0 / token1 | WETH `0x0Bd7…AD73` / BUFFCAT `0xD80a…2036` |
| Swap router | `0x8876789976decbfcbbbe364623c63652db8c0904` — UniversalRouter, Blockscout-verified, immutable (proxy slot zero), 24,546 B |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` — canonical, 39 bytes differ from Ethereum (immutables only) |
| `feeProtocol` | **0** — verified 2026-07-20; volume figures are not understated |
| Pool size | 16.47 WETH + 77,488,559 BUFFCAT ≈ $56,600 (2026-07-20) |

**NOT canonical Uniswap.** This is a fork deployment; addresses from Uniswap's
docs are wrong for this chain.

**BUFFCAT has no `burn()`.** It is a launchpad `LaunchToken` inheriting plain
OZ `ERC20`, not `ERC20Burnable`, and it is immutable. Burning means
`safeTransfer` to `0x…dEaD`. `totalSupply()` will sit at 1B forever, so:

> **`circulating = totalSupply() - balanceOf(dEaD)`.** Binding across the
> contract, the bot, the website, and all public comms. Never quote
> `totalSupply()` as evidence of a burn.

### Volume is readable on-chain

V3 pools do not store volume and contracts cannot read event logs, but the fee
accumulators are in storage:

```
fees   = (feeGrowthNow - feeGrowthLast) * liquidity / 2^128   // wrapping sub
volume = fees * 1e6 / poolFee
```

`token0 = WETH` and V3 charges the fee on the INPUT token, so
`feeGrowthGlobal0` = BUYS and `feeGrowthGlobal1` = SELLS.

**PROVEN exact:** two consecutive reads with liquidity unchanged recovered a
buy of 0.03000000 WETH (fee 0.0003 = 1%).

Limitations, accepted: accuracy depends on in-range liquidity being stable
across the interval (frequent snapshots keep error small; a lifetime
computation is unreliable); out-of-range liquidity is undercounted; a nonzero
`slot0().feeProtocol` would understate volume and must be checked at deploy.

## 4. What gets built

**`BuffCatTreasury.sol`** — receives ETH and BUFFCAT, buys BUFFCAT, holds a
full-range V3 position, collects LP fees, funds dividends, and burns.

Value-moving destinations are limited to the immutable set in
`architecture.md` → System Boundaries: the pool, the router, Permit2, WETH9,
the position manager, the miner's dividend function, and DEAD. No EOA
destination exists anywhere in the code.

PURRGE and HYPURR are owner-gated (timing only, never destination); funding and
fee collection stay permissionless. See §5a.

```
receive ETH        (25% buyback share, sent by the miner as today)
receive BUFFCAT    (donations, and v2 fee routing later)

swapEth()          permissionless; ETH -> BUFFCAT via the pool
                   TWAP-guarded, size-capped, rate-limited
addLiquidity()     permissionless; pairs held ETH+BUFFCAT into the position
collectFees()      permissionless; harvests LP fees into the vault
fundDividends()    permissionless; pushes WETH to miner.fundEthDividends()
burn()             permissionless; sends BUFFCAT to 0x…dEaD per the trigger
```

### Full-range liquidity, deliberately

V3 concentrated positions go out of range, stop earning, and convert to a
single asset — requiring a human to rebalance. **Full range** (min tick to max
tick) behaves like V2: never out of range, always earning, zero management.
Lower capital efficiency; the only V3 mode that is genuinely autonomous.

### MEV: the objection has an on-chain answer

In-contract swaps were previously rejected over sandwich risk. V3 pools carry
their own TWAP (`observe()`) — the pool's price history, not an external feed.
Require spot within a tolerance band of the 30-minute TWAP before swapping,
plus a per-call size cap and a minimum interval. An attacker can then only move
price inside the band, and the vault's trade is too small to make that
profitable. No external oracle; the pool reads itself.

### Burn trigger (carried over from the burn-vault design)

```
canBurn() = vaultBalance >= DUST_FLOOR
         && ( weightedVolumeSinceLastBurn >= VOLUME_THRESHOLD
              || block.timestamp >= lastBurnAt + FALLBACK_INTERVAL )
```

Sells are BUFFCAT-denominated and converted to WETH via the pool's own
`sqrtPriceX96`. Two-step `mulDiv` is REQUIRED — `sqrtPriceX96^2` reaches 320
bits and overflows uint256, as does `deltaFeeGrowth * liquidity`.

## 5. Parameters

| Param | Value | Basis |
| --- | --- | --- |
| `LP_BPS` / `BURN_BPS` | **7000 / 3000** | Liquidity depth is the live blocker; weight it there and shift toward burn as depth improves |
| `VOLUME_THRESHOLD` | **100e18** (100 WETH weighted) | 10h measurement: 13.3 WETH/day weighted -> ~7.5d cadence |
| `FALLBACK_INTERVAL` | **7 days** | Covers quiet weeks |
| `BUY_BPS` / `SELL_BPS` | **7000 / 3000** | Bias the burn trigger toward buying pressure |
| `DUST_FLOOR` | **100_000e18** BUFFCAT | Stops gas-wasting micro-burns |
| `MAX_DEVIATION_BPS` | **200** (2%) | Spot vs 30-min TWAP before any swap |
| `MAX_SWAP_BPS` | **50** (0.5% of reserves) | Per-call size cap |
| `MIN_SWAP_INTERVAL` | **1 hour** | Between swaps |
| `EMERGENCY_CAP_BPS` | **200** (2% of circulating) | Circuit breaker only; must never fire normally |
| `HYPURR_SWAP_BPS` | **300** (3% of reserves) | 6x PURRGE, visibly the big one; past ~5% slippage outweighs tokens gained |
| `HYPURR_VAULT_BPS` | **5000** (50% of vault) | Second cap, so one HYPURR cannot drain the vault |
| `HYPURR_INTERVAL` | **7 days** | Bounds a compromised key, not the owner |

Measured basis (10h, 82 windows, 2026-07-18/19): buys $10,249.85 (49.9%),
sells $10,300.37 (50.1%), raw $20,550.22, weighted $10,265.01 = 50.0% of raw
-> **13.3 WETH/day weighted**, raw ~$49,320/day.

Note: at a 50/50 flow split the 70/30 weighting yields exactly 50% of raw — it
does nothing. It only bites when flow is directionally skewed, which is when
you want it to.

**`VOLUME_THRESHOLD` confirmed at 100e18 (2026-07-20), across four windows:**
13.3 / 27.7 / 31.1 / 43.2 weighted WETH/day — a 3.3x spread with no stable
baseline. 100 WETH fills in 2.3 days at the current rate, 3.6 days at 27.7, and
~7.5 days at the quietest observed — degrading into the 7-day fallback rather
than going dead. Nothing else in that range does both.

Reasoning reversed mid-session: an earlier note to err high (200) assumed the
threshold was the trigger. With PURRGE owner-gated, any threshold above ~7 days
of volume never fires, because the fallback opens the gate first. Re-derive
after a quiet week.

Owner may retune `LP_BPS`/`BURN_BPS`, `VOLUME_THRESHOLD`, `FALLBACK_INTERVAL`,
`BUY_BPS`/`SELL_BPS`, `DUST_FLOOR` within hard bounds. `EMERGENCY_CAP_BPS`,
`MAX_DEVIATION_BPS`, and the tick range are immutable.

## 6. Invariants

1. **ETH and BUFFCAT leave the treasury ONLY to the pool, the miner's dividend
   function, or `0x…dEaD`.** No EOA destination exists anywhere in the code.
   No owner withdrawal, no arbitrary `call`, no `delegatecall`, no upgrade path.
   This is the invariant that matters most.
2. LP liquidity may be decreased only back INTO the treasury, where rule 1
   still binds.
3. Every swap passes the TWAP deviation check, the size cap, and the interval.
4. A burn never exceeds `circulating * EMERGENCY_CAP_BPS / 10000`.
5. `totalBurned` counts only burns performed BY this contract — the
   pre-existing 108,092,328 at `dEaD` is excluded.
6. `circulatingSupply()` == `totalSupply() - balanceOf(DEAD)` at all times.
7. The LP position is full-range; tick bounds are immutable constants.

## 7. Miner change (the whole of it)

`fundEthDividends` : `onlyOwner` -> permissionless.

Nothing else. Tiers, multipliers, fee splits, `Choice`, `MIN_HOLD`,
accumulators, and all ABI names are untouched. `TIER_DURATION` and
`TIER_MULT_BPS` stay UPPER_CASE (ABI-critical, see code-standards.md).

This still requires re-running `forge test` (20/20) and Slither, and a fresh
testnet deploy + Blockscout verify. It does not require redesigning the miner.

## 8. Step 3 test list

Unit — treasury
- swap reverts when spot deviates beyond `MAX_DEVIATION_BPS` from TWAP
- swap reverts when size exceeds `MAX_SWAP_BPS` of reserves
- swap reverts inside `MIN_SWAP_INTERVAL`
- addLiquidity mints a full-range position with the expected ticks
- collectFees increases treasury balances
- fundDividends forwards WETH and the miner's accumulator advances
- burn below dust floor reverts
- burn below threshold and before fallback reverts
- burn fires on threshold met; burn fires on time elapsed
- burn transfers exactly `min(balance, cap)` to DEAD
- `circulatingSupply()` decreases by exactly the burned amount
- **no code path sends ETH or BUFFCAT to an arbitrary address** (assert by
  inspection AND by fuzz)

Volume
- fee-growth delta -> volume matches a hand-computed value
- wrapping subtraction handles accumulator overflow
- liquidity drift is flagged
- 70/30 weighting correct; 50/50 flow yields exactly 50% of raw

Attack
- reentrancy through the swap callback
- reentrancy on burn (hostile token)
- `sqrtPriceX96` driven to extremes: no revert, no overflow
- TWAP manipulation attempt: swap must revert, not underprice
- direct donation of ETH/BUFFCAT: usable but not extractable
- burn called twice in a block: second reverts

Invariant fuzz (128k calls, mirroring the miner's suite)
- value never reaches an EOA
- `totalBurned` + balances == cumulative received
- burn never exceeds the emergency cap
- `circulatingSupply()` == `totalSupply()` - `balanceOf(DEAD)`

## 9. Deferred to v2 (designed, NOT being built now)

Each of these restarts `BuffCatMiner.sol` at Step 2. Recorded so the work is
not lost; revisit once the treasury is live and a full week of volume data
exists.

**Tier ladder capped at 1 year.** Current tiers run to 100 years at 6.0x. Long
locks never expire, so their weight sits in the dividend denominator forever:
100 early lockers at 6.0x would take **63%** of all rewards when the next 100
people join, and would still be taking a cut a decade later. Proposed 6-tier
ladder, max 3.2x: 1d/1.00, 7d/1.25, 30d/1.60, 90d/2.10, 180d/2.60, 365d/3.20.
Every position expires within a year; weight recycles.

**Dynamic fee.** The flat 0.003 ETH fee is regressive — 5.54% of a $100
position, 0.11% of a $5,000 one. Two options:
- *Brackets by BUFFCAT amount* — no price needed at all, but brackets go stale
  as price moves and need periodic adjustment. Safe fallback.
- *Percentage of value (100 bps)* via the pool's own 30-min TWAP, clamped to
  0.0005-0.05 ETH. $100 locker pays $1.00 instead of $5.54; $5,000 locker pays
  $50. Revenue per 1,000 locks $5,948 vs $5,538 today — slightly more, while
  making small positions far cheaper.
  RISK: introduces a price dependency, which was a deliberate no. A $21.8K pool
  is cheap to push around. Clamps bound the damage to lost revenue, never
  principal. Gets safer as treasury-owned liquidity deepens.

**Fee re-routing.** Send 100% of the ETH fee to the treasury instead of the
in-contract 25/40/15/20 split, making allocation a treasury policy adjustable
without a redeploy. Also route the BUFFCAT-denominated fees (2% compound, 15%
early-exit) to the treasury — these are price-INVARIANT and would give a
deflation floor that does not erode as price rises.

**Frontend rewire.** Specified in `frontend-changes-v2.md`. Depends on
`quoteFee(uint256)` and `feeBps()`, which do not exist. Do not merge early.

## 10. Open questions

1. **Swap router — RESOLVED 2026-07-20.** UniversalRouter
   `0x8876789976decbfcbbbe364623c63652db8c0904` + Permit2, both verified
   immutable. Found via Permit2 `Approval` logs (2,998 approvals, ~6x the next
   address), not by sampling a swap — the first swap sampled led to an
   upgradeable look-alike. Exact-amount, short-expiry approvals only.
   REMAINING CONDITION: confirm the `V3_SWAP_EXACT_IN` encoding against the
   verified source before Step 2 — this router is reported to be a modified
   fork carrying an extra `minHopPriceX36` field in the v4 swap struct. Our
   pool is V3 and the standard callback selector is present, so the V3 path is
   likely untouched. Fallback if modified: direct `pool.swap()` with a guarded
   callback (`msg.sender == POOL` check mandatory).
2. **Circulating — RESOLVED 2026-07-20.** `total - dEaD`, unchanged.
   `balanceOf(0x0)` is **0**, so there is no gap. Treasury holdings are
   disclosed separately via `treasuryHeld()` and never netted out; netting
   would make the supply figure drop on days nothing was burned.
3. **Mainnet owner — RESOLVED 2026-07-20 (revised).** Safe 1.4.1 verified
   available on this chain (bytecode keccak identical to Ethereum, `VERSION()`
   returns 1.4.1). **Superseded by owner decision: single-key EOA (Rabby) owns
   both contracts.** Accepted risks recorded in progress-tracker 2026-07-20:
   single point of failure, no rotation without redeploy, and the miner key can
   reroute reward flow. Deployer != owner still binds. Migration to Safe later
   needs no contract change.
4. **`VOLUME_THRESHOLD` — RESOLVED at 100e18** across four windows spanning
   3.3x (see §5). Owner-settable within bounds; re-derive after a quiet week.
5. **Impermanent loss — STILL OPEN, and now larger.** All treasury projections
   track dollars deployed, not position value after price movement. Computed
   2026-07-20: **fees stop covering IL at 5.8x**, and BUFFCAT moved 7x in 42
   hours on 2026-07-18/19. The proposed seeding round
   (`context/miner-v2-design.md` §5) places the IL on the treasury by design,
   so this now requires a **hard cap on the treasury's BUFFCAT commitment**,
   set before any round opens.

## 5a. PURRGE / HYPURR trigger model (2026-07-20)

```
setArmed(bool)      onlyOwner  — the ON/OFF switch, readable by page and bot
purrge()            onlyOwner  — armed && threshold && interval; atomic swap+burn
hypurr(bytes32 tag) onlyOwner  — milestone burn, reason recorded on-chain
rescuePurrge()      permissionless after 180 days of owner silence — anti-brick
fundDividends()     permissionless
collectFees()       permissionless
```

Everything owner-gated is **timing**. Nothing owner-gated is **destination**.

`rescuePurrge()` is load-bearing: ownership is single-key (§10.3) and the vault
has no withdrawal path, so without it a lost key strands the ETH permanently.
It is unreachable while the owner is active.

## 11. Gate to leave Step 1

- [ ] This document reviewed and committed to `context/`
- [ ] `burn-vault-design.md` deleted or marked superseded
- [x] Swap router resolved — UniversalRouter + Permit2 (§10.1)
- [x] Open questions 2, 3 and 4 answered on on-chain evidence (§10)
- [ ] **Pool `observationCardinality` increased and slots filled.** Currently
      **1** (verified 2026-07-20): the pool stores no price history, so
      `observe()` over 30 minutes REVERTS and every guarded swap would revert —
      fails safe, but the vault would be inert.
      `increaseObservationCardinalityNext(N)` is permissionless (~20k gas per
      slot), but slots fill only as trades occur and 30 minutes must elapse
      before an average exists. Size N from measured distinct-blocks-with-swaps
      per 30-minute window x 3-4. **This is the remaining hard blocker.**
- [ ] `architecture.md` updated: treasury in System Boundaries; invariant added
      for "value leaves the treasury only to pool, dividends, or DEAD"
- [ ] `progress-tracker.md` updated: Step 1 complete, Step 2 next
