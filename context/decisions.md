# Session brief — anti-drift

Paste the two blocks below into the repo. Everything here is either **settled
with evidence** or **explicitly open**. If a future session cannot tell which,
that is the drift this document exists to prevent.

Read order for an assistant: `CLAUDE.md` -> this file -> `next-session.md`.

---

## BLOCK 1 — replaces "## The one open decision" in `context/next-session.md`

```markdown
## The sequencing decision

**DECIDED: _______________** (set this line before the session starts; leave
blank only if genuinely undecided, never fill it with an assumption)

    [ ] Track C now — build v2, supersede the v1 testnet deploy
    [ ] Track B on v1 first — treasury on top of the deployed miner

### The framing correction that changes the trade

An earlier version of this table claimed "Track A Step 5 work: **preserved**"
under v1-first. **That row was false.** `treasury-design.md` §7 requires
`fundEthDividends` to go `onlyOwner` -> permissionless, and states that this
"requires re-running `forge test` (20/20) and Slither, and a fresh testnet
deploy + Blockscout verify."

The current testnet deployment `0xEcd9e1E717D6628513E1E555702ED21a222872A5` is
superseded **either way**. v1-first delays discarding Step 5; it does not
preserve it. Do not reintroduce that row.

### The case for Track C now (recorded 2026-07-20)

1. **One audit, not two.** Step 6 is the most expensive step. If v2 happens at
   all, auditing v1 first pays twice for the same economics.
2. **Migration cost is zero today and only rises.** Nothing is live; no real
   positions exist.
3. **v1's economics are known-broken.** The dividend pot is $111/week at 50
   locks/week and does not grow with TVL — measured, see progress-tracker
   2026-07-20. Shipping v1 ships a yield product whose yield disappoints.

### The case for v1 + treasury first

1. v1 is four ritual steps in; v2 is zero.
2. v2 has unresolved design problems (below).
3. The treasury connects to the same LP-fee stream and works on v1.

### HARD CONDITION on Track C

**Resolve the V3 NFT staking approach BEFORE writing any Step 2 code.**

The sandbox skeleton's `Pool` struct holds `IERC20 stakeToken`. Uniswap V3
positions are NFTs, so pool 1 cannot use that shape. Deciding this after the
contract is written forces a third rewrite.

Two options to weigh, then write the answer into `miner-v2-design.md` §9.1:
- a `Pool` struct carrying a stake-type flag, or
- a separate LP-staking contract reporting into the miner.

Per `ai-workflow-rules.md`: resolve ambiguity in the context file first, do not
guess in code.

### What the decision does NOT gate

Track B proceeds in parallel regardless. The treasury is a separate contract,
independent of which miner is live, and is blocked only on cardinality. Do not
serialise them.
```

---

## BLOCK 2 — append to `context/progress-tracker.md`

```markdown
## Session — sequencing decision (2026-07-2_)

### Correction to a prior doc

`next-session.md` listed "Track A Step 5 work: preserved" under the v1-first
option. False: `treasury-design.md` §7 requires a fresh testnet deploy and
Blockscout verify for the `fundEthDividends` permissioning change, so the
current deployment is superseded on both paths. Corrected in that file.

### Decision

Sequencing: ____________________
Reasoning: ____________________
Date: ____________________

### Conditions carried

- V3 NFT staking approach resolved in `miner-v2-design.md` §9.1 before Step 2.
- Router `V3_SWAP_EXACT_IN` encoding confirmed against verified source.
- Pool `observationCardinality` raised and slots filled before any swap path
  is deployed.
```

---

## Guardrails for the assistant

### Settled — do not re-open without new on-chain evidence

| Item | Value | Evidence |
| --- | --- | --- |
| Swap route | UniversalRouter `0x8876…0904` + Permit2 | 24,546 B, proxy slot zero, Blockscout-verified, 2,998 Permit2 approvals |
| Permit2 | canonical | 9,152 B both chains, 39 differing bytes (immutables) |
| Circulating | `totalSupply() - balanceOf(dEaD)` | `balanceOf(0x0)` = 0, no gap |
| Mainnet owner | single-key EOA (Rabby), both contracts | owner decision, risks recorded |
| `VOLUME_THRESHOLD` | `100e18` | four windows, 13.3–43.2 weighted WETH/day |
| PURRGE / HYPURR | all triggers `onlyOwner`; `rescuePurrge()` after 180d | owner decision |
| Burn baseline | dated reading, never a constant | 34 events, one sender, `LaunchLocker`-funded |

The owner has ruled on the owner model and the trigger permissions. Do not
re-argue multisig or permissionless execution. `rescuePurrge()` stays.

### Open — must not be treated as settled

1. Sequencing (Block 1).
2. V3 NFT staking shape.
3. Pool `observationCardinality` = 1 — the one hard blocker.
4. Router source review.
5. Seeding round: qualified advice required before any deposit.
6. Treasury BUFFCAT commitment cap.
7. `treasury-design.md` §1 crossover table — assumed 100% of lock fees; the
   contract sends 25%. Re-run before external use.

### Never

- No mainnet before Steps 5 and 6.
- Never merge `frontend-changes-v2.md` (`quoteFee()`/`feeBps()` do not exist).
- Never run Hardhat. Foundry only.
- Never edit `legacy/contracts/BuffCatMiner.sol`.
- Never publish a fixed or "up to" APY. Live rate plus historical range only.
- Never put `MinerV2Core.sol` in `contracts/` — sandbox artifact, and a
  same-named contract in the tree is the hazard already quarantined once.

### Failure modes observed in this project — check yourself against these

- **Generalising from one sample.** The first contract sampled from the pool
  was an upgradeable look-alike, not the router. A buy/sell split extrapolated
  from two log lines was wrong across 500 samples. Both on 2026-07-20.
- **Declaring an open item moot.** `VOLUME_THRESHOLD` was called irrelevant and
  was not; the owner corrected it.
- **Inheriting a claim from a doc without checking it.** The "Step 5 preserved"
  row above survived several sessions unexamined.
- **Treating a snapshot as a constant.** 108,092,328 was a mid-flight reading
  of a live third-party burn programme.
- **Asserting a tool limitation without testing it.** State what was tried and
  what the error said, not what is assumed to be blocked.

Sandbox compilation and JS simulation are **not** ritual steps and never
substitute for Foundry. Say so every time they are cited.

### Verification standard

Record only what is verified, and cite the mechanism: a tx hash, a `cast`
output, a passing test. Date-stamp every on-chain reading. When a result is
surprising, confirm it through a different mechanism than the one that
reported it.
