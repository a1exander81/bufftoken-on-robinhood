# BuffCatMiner v2 + Seeding Round — Design

Status: **Design draft, 2026-07-20.** No production Solidity written.
Sandbox-verified skeleton only (see §8).

Supersedes nothing. Sits alongside `treasury-design.md`; the treasury design
is unchanged except where noted in §7.

**This document does not open Step 2.** It is the design artifact that Step 1
of Track C would gate on.

---

## 1. Why v2 exists

Measured 2026-07-20, all figures verified on chain 4663:

| | Value |
| --- | --- |
| Dividend pot, current design | **$111/week** at 50 locks/week |
| Pool trading fees, same period | **$6,830/week** |
| Ratio | **62x** |

The dividend pot is fed by lock fees. Lock fees are ~$278/week gross at 50
locks/week ($5.56 flat fee), of which 40% is dividends. The pot does not grow
with TVL — it grows with lock *count* — so yield falls as the product succeeds:

| Total locked | Pot/yr | APY |
| --- | --- | --- |
| $25,000 | $5,800 | 23% |
| $100,000 | $5,800 | 5.8% |
| $300,000 | $5,800 | 1.9% |

The trading-fee stream next to it is 62x larger and flows to whoever owns pool
liquidity. **v2 exists to connect the miner to that stream.** No change to the
fee split, tiers, or accumulator math achieves this; it requires a pool the
miner can pay LP stakers from.

## 2. What changes

| | v1 (deployed, testnet) | v2 |
| --- | --- | --- |
| Pools | 1 (locked BUFFCAT) | N, `allocPoint`-weighted |
| Funding split | 100% to lockers | by `allocPoint`, owner-settable |
| Empty pool | n/a | slice rolls to live pools |
| LP incentive | none | pool 1 |
| Reward timing | lumpy (on `fund*` call) | streamed over a duration (§6) |
| Tiers, `Choice`, fee model, ABI names | — | unchanged |

Launch config:

```
pool 0   miners  (BUFFCAT locked)     allocPoint 700
pool 1   seeders (LP position locked) allocPoint 300
```

One reward token at launch: **ETH**. USDG and featured added later as
campaigns, on specific pools.

## 3. Pool policy (binding)

A new pool must **feed the pot**, not only claim from it.

| Pool type | Brings in | Allowed |
| --- | --- | --- |
| BUFFCAT lock | lock fees, supply off market | yes |
| LP stake | pool depth -> volume -> fees | yes |
| Second BUFFCAT pool, different terms | nothing | **no** |
| Partner token | their volume, if paired | case by case |

`allocPoint` is a **divider, not a multiplier**. Reweighting moves money
between groups; it never creates any. Three pools each get less than two did
from the same pot.

Reward tokens are the expensive axis, not pools. A pool is an array entry. A
reward token is an ongoing obligation in a real asset that must be topped up.
**Many pools, few reward tokens.**

## 4. Tier structure

| | Tier 1 — Seeders | Tier 2 — Miners | Tier 3 — entry |
| --- | --- | --- | --- |
| Stake | LP position | BUFFCAT | BUFFCAT |
| Min lock | 90 days | 3 days | 1 day, unlimited relock |
| Pool | 1 (alloc 300) | 0 (alloc 700) | 0, base tier |
| Perks | rank multiplier, whitelist, featured eligibility | full tier ladder, featured | none |
| Project gets | pool depth, locked | supply off market | fee churn + volume |

Tier 3 exists because fee revenue is **per lock**, so a 1-day relocker paying
weekly is worth ~52x a 100-year locker in revenue terms. Raising the miner
minimum to 3 days (as intended) without keeping a 1-day tier somewhere would
delete that revenue.

**Featured eligibility extends to tier 1.** This reverses an earlier
pool-0-only recommendation: featured campaigns are the scarcest reward and
seeders are the scarcest resource.

### Rank weighting

Rank derives from seed size, with square-root weighting plus a hard cap.
Tested (`seed.js`), 10 seeders spanning a 20x range:

| Scheme | Largest takes | Top 3 take |
| --- | --- | --- |
| Linear | 33% | 67% |
| sqrt | 20% | 49% |
| cap at 3 WETH | 16% | 47% |
| **sqrt + cap at 3** | **13%** | **40%** |

Three layered caps:

1. Per-wallet counted seed caps at ~3 WETH
2. Rank multiplier ceiling **1.5x** (bands: 0.25 WETH 1.10x, 1 WETH 1.25x,
   3 WETH 1.40x, 10+ WETH 1.50x)
3. **Pool 1 `allocPoint` capped at 30%** — seeders as a class never exceed 30%
   of dividends regardless of how many join

Layer 3 is the promise to miners: seeders get priority, not the pot.

Rank must be recorded on-chain at seed time (`seedWeth` per wallet, stored by
the LP-lock contract, read by the miner) or it is unverifiable later. This is a
cross-contract dependency to specify before Step 2.

## 5. Seeding round — single-sided ETH

### The finding that determines the structure

50/50 LP seeding is a bad deal for anyone bullish on BUFFCAT. Computed
(`il.js`), $1,000 seeded 90 days, ~$998 fees at measured volume:

| BUFFCAT moves | Seeder vs simply holding |
| --- | --- |
| 2x | +$912 |
| 5x | +$234 |
| **7x** | **-$356** |
| 10x | -$1,340 |
| 20x | -$5,030 |

**Fees stop covering impermanent loss at 5.8x.** BUFFCAT moved 7x in 42 hours
on 2026-07-18/19 (verified: $0.0000589 -> $0.000424 via `slot0()`). This is the
base case for this token, not a tail risk.

Seeders are by definition bullish. LPing is a bet against large upside. The
round would recruit believers into a position that punishes them for being
right. IL cannot be rebated — it is a real transfer to arbitrageurs
($2,338 on $1,000 at 10x). Underwriting it is what ended Bancor's IL protection
in 2022.

### Structure

```
Seeder deposits ETH only.
Treasury supplies the BUFFCAT side from its own holdings.
Contract holds the LP position for the lock term.
Seeder is repaid in ETH, plus fee share, plus vested BUFFCAT bonus.
The TREASURY absorbs the IL.
```

IL lands where it does not hurt: if BUFFCAT rises, the treasury ends up holding
more ETH and less BUFFCAT, which is what a treasury wants after a run and it
never had a sell-side obligation.

It also addresses a larger market — ETH-yield seekers rather than BUFFCAT
believers — which is the group that will actually accept a 90-day lock.

### Parameters

| | Value | Basis |
| --- | --- | --- |
| Soft cap | **$15,000** | pool +27%; below this the lock is unjustifiable |
| Hard cap | **$50,000** | pool ~$107K; beyond, per-seeder share thins faster than volume grows |
| Minimum lock | **90 days** | survives a red month, still sellable |
| Rank bands | 90d 1.0x, 180d 1.25x, 365d 1.5x | on miner hashpower |
| Round window | 30 days or hard cap | if soft cap misses in 30 days, refund |
| Denomination | **WETH on-chain**, USD for marketing | no oracle rule stands |
| BUFFCAT bonus | ~1% of position per 10 days, full at 90 | vesting shape from Bancor, bounded |
| Treasury BUFFCAT commitment | **hard cap, set before the round opens** | bounds IL exposure from day one |

### Fee split

The contract holds the locked LP position, so **the contract collects the
trading fees**. Split **70/30** — 70% to the seeder, 30% into the miner
dividend pot.

Without this split the round does not fund miners at all. It must be stated up
front in the round materials; discovering it later reads as a bait and switch.

### Modelled returns, $1,000 for 90 days

| Volume scenario | Return |
| --- | --- |
| Quiet (0.45x) | ~$565 |
| Measured | ~$1,098 |
| Hot (1.85x) | ~$1,945 |

Per-dollar return falls as the round fills: $998 per $1,000 at soft cap,
$790 at $30K raised, $659 at hard cap. Early seeders genuinely do better.

**Do not annualise these.** ~$998/90d implies ~400% APY. That number exists
only because the pool currently turns over ~12x its own depth weekly, an
artifact of a hot market that compresses as depth grows or volume normalises.
Quote a range and a live figure, never a single annualised number.

## 6. Streamed rewards (from the Synthetix pattern)

v1 accumulators only advance when `fund*` is called, so dividends arrive in
lumps and any live APY display spikes on funding day and reads zero between.

Adopt `rewardRate` + `periodFinish`: a funding call sets a per-second rate that
accrues until the period ends. Contained change to how a deposit is recorded;
does not touch tier logic.

Four defects observed in the reference `MultiRewardStaking` sample, to avoid:

1. `rewardRate = reward / duration` truncates to **zero** for small amounts
   over long durations, stranding the funds. Canonical Synthetix guards with
   `require(rewardRate > 0)`.
2. Missing `require(rewardRate <= balance / duration)` — the rail that catches
   funding by direct transfer rather than through the notify function.
3. If the staking token is also a reward token, **principal and rewards share
   one balance** with nothing separating them. Live risk here: staking BUFFCAT
   and rewarding BUFFCAT would let a misconfiguration pay stakers from other
   stakers' principal, violating invariant 2.
4. `updateReward` loops every reward token on every user action; each campaign
   token permanently raises gas for all users. Owner-only, not attacker
   controlled, but unbounded and with no removal path.

## 7. Interaction with `treasury-design.md`

Unchanged: treasury structure, invariants, PURRGE/HYPURR triggers, routing.

Changed:
- §1 crossover model assumed ~100% of lock fees reaching the treasury
  ($271/wk). The contract sends **25%** (~$69/wk). Real timeline is ~3-4x
  longer than stated. The crossover table must be re-run before external use.
- §3 "already burnt 108,092,328" is a **dated reading, not a constant** — see
  progress-tracker 2026-07-20.
- The treasury now has a second obligation: supplying the BUFFCAT side of the
  seeding round, and absorbing its IL. Requires an explicit cap.

## 8. Sandbox verification (not a ritual step)

`MinerV2Core.sol` compiled with solc 0.8.24 + OpenZeppelin 4.9.6: zero errors,
zero warnings, 13,812 bytes.

`sim.js` mirrors the contract's integer arithmetic exactly (BigInt, truncating
division):

| Check | Result |
| --- | --- |
| 70/30 `allocPoint` split | exact |
| Empty pool forfeits slice to live pools | pass |
| Late joiner earns nothing retroactively | pass |
| Reweight applies to future funding only | pass |
| Tier multipliers inside a pool (1x / 6x) | exact |
| Solvency, 5,000 randomised ops | never owed more than funded |
| Rounding dust | 271,445 wei on 717 ETH funded (1e-13%) |

**This is not a Foundry test suite and does not substitute for any step of the
7-step ritual.** It de-risks the distribution math only.

### Design decision the port forced

MasterChef mints per block, so an empty pool simply mints less. This design is
push-funded with real ETH in discrete lumps — splitting by raw `allocPoint`
would strand an empty pool's slice permanently. Fix, tested: **split across
pools with live stake only**; an empty pool's share rolls to the others in the
same transaction. Matters on day one, when pool 1 exists but is unfarmed.

### Not in the skeleton

Featured snapshot gating, `compound`, and early-exit penalties are **stubbed,
not removed**. They port mechanically from v1 and belong in Step 2, written
against the Foundry suite where a mistake is caught — not re-derived in a
sandbox, where drift from the tested versions is the risk.

## 9. Known problems to solve before Step 2

1. **The pool is Uniswap V3 — LP positions are NFTs, not fungible tokens.**
   Staking them is materially harder than staking an ERC-20; PancakeSwap needed
   a separate MasterChefV3 for exactly this. Must be specified, not assumed.
2. **V3 fees do not auto-compound.** Someone must call `collect()`. Make it
   permissionless.
3. Rank storage and the miner's read path across two contracts.
4. Treasury BUFFCAT commitment cap for the round.
5. Whether the seeding round constitutes an offering — **obtain qualified
   advice before accepting any deposit.** Robinhood Chain is adjacent to
   tokenised equities.
6. Reward-token add/remove path and gas bound (§6.4).

## 10. Cost

v2 is a new `BuffCatMiner.sol`. Track A restarts at Step 2: rewrite against the
Foundry suite, fresh Slither, new testnet deploy, new Blockscout verification,
new click-through. The current testnet deployment
(`0xEcd9e1E717D6628513E1E555702ED21a222872A5`) and everything proven on it are
superseded.

Surviving from v1: accumulator math, tier multipliers, three-asset `Choice`,
snapshot-gated featured logic.

**The sequencing decision is open:** v2 now (restart once, before anything is
live) or v1 + treasury first (restart later, with live positions to migrate).
Restarting now is cheaper. Shipping v1 first is sooner. Not decided in this
document.
