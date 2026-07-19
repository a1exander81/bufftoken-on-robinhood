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
| Already burnt at `0x…dEaD` | 108,092,328 (10.8092%) |
| Circulating | 891,907,672 |
| V3 factory | `0x1f7d7550B1b028f7571E69A784071F0205FD2EfA` |
| Position manager | `0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3` (~24.4KB, `factory()` and `WETH9()` both verified) |
| Pool | `0xde543192e1939Ee2538db77CCc225Aa67412bEa6` |
| Fee tier | 10000 (**1%**) |
| token0 / token1 | WETH `0x0Bd7…AD73` / BUFFCAT `0xD80a…2036` |
| Swap router | **UNKNOWN — blocking, see §10** |

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

Every function permissionless. The contract enforces the rules; nobody holds a
key that can take anything out, including the owner.

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

Measured basis (10h, 82 windows, 2026-07-18/19): buys $10,249.85 (49.9%),
sells $10,300.37 (50.1%), raw $20,550.22, weighted $10,265.01 = 50.0% of raw
-> **13.3 WETH/day weighted**, raw ~$49,320/day.

Note: at a 50/50 flow split the 70/30 weighting yields exactly 50% of raw — it
does nothing. It only bites when flow is directionally skewed, which is when
you want it to.

An earlier 67-minute sample gave 31.1 WETH/day and a 220 WETH threshold. It
caught a +25% price run and was unrepresentative. **Re-derive from a full week
before mainnet.** 10h is enough to design against, not to launch against.

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

1. **Swap router address — BLOCKING.** Not discoverable from the pool or the
   position manager. Find via Blockscout (the caller of `pool.swap()` on any
   recent trade). Alternative: call `pool.swap()` directly with a callback,
   removing the dependency and giving exact slippage control. Decide before
   Step 2.
2. **Does `circulating` also exclude LP / team / treasury holdings?** Currently
   total - dEaD only. Note the treasury will itself hold BUFFCAT, which makes
   this sharper than before. Must match across contract, bot, and comms;
   changing it after publishing burn figures is expensive.
3. **Mainnet owner** — hardware wallet or multisig. Still undecided, now
   gating a contract that holds real value.
4. **Re-derive `VOLUME_THRESHOLD`** from a full week of bot data.
5. **Impermanent loss is not modelled.** All treasury projections track dollars
   deployed, not position value after price movement. At 10x, IL is 42.5%
   against simply holding. Fee figures hold (they accrue on volume); balance
   figures are optimistic.

## 11. Gate to leave Step 1

- [ ] This document reviewed and committed to `context/`
- [ ] `burn-vault-design.md` deleted or marked superseded
- [ ] Swap router resolved, or the direct-`pool.swap()` route chosen
- [ ] Open questions 2 and 3 answered or explicitly deferred with reasons
- [ ] `architecture.md` updated: treasury in System Boundaries; invariant added
      for "value leaves the treasury only to pool, dividends, or DEAD"
- [ ] `progress-tracker.md` updated: Step 1 complete, Step 2 next
