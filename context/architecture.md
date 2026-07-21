# Architecture Context

## Stack

| Layer            | Technology                                  | Role                                                        |
| ---------------- | ------------------------------------------- | ----------------------------------------------------------- |
| Smart contract   | Solidity ^0.8.24, Foundry (forge)           | Core logic: locking, dividends, featured campaigns, fees    |
| Contract deps    | OpenZeppelin (IERC20, SafeERC20, Ownable, Pausable, ReentrancyGuard) | Battle-tested primitives |
| Chain            | Robinhood Chain (Arbitrum Orbit L2)         | Mainnet chain 4663; testnet chain 46630; gas token = ETH    |
| Frontend         | Static HTML + vanilla JS (no framework)     | UI; no build step                                           |
| Web3 lib         | ethers.js 5.7.2 (UMD, vendored at `vendor/`)| Wallet + contract calls                                     |
| Hosting          | Vercel (vercel.json rewrites)                | Static hosting                                              |
| Explorer/verify  | Blockscout                                   | Contract verification + inspection                          |

## System Boundaries

- `contracts/src/BuffCatMiner.sol` — **THE contract.** Single source of truth
  for all economic logic. Nothing else may re-implement its math. This is the
  file that is tested, Slither-triaged, deployed to testnet, and verified.
- `contracts/test/*.t.sol` — Foundry tests (unit, attacks, compound, featured,
  hostile-token, invariant) + `Mocks.sol`. The proof the contract is correct.
- `contracts/script/DeployTestnet.s.sol` — Foundry deploy script.
- `contracts/foundry.toml` — `src = "src"`, so `forge` builds the correct file.

- `contracts/src/BuffCatTreasury.sol` — the treasury vault (Track B). Receives
  ETH and BUFFCAT, buys BUFFCAT, holds a full-range V3 position, collects LP
  fees, funds miner dividends, and burns (PURRGE / HYPURR). Every value-moving
  destination is an immutable constructor-set address. It does NOT re-implement
  dividend math — it calls the miner's existing `fundEthDividends()`.
  Design: `context/treasury-design.md`.

  External contracts it touches (the COMPLETE set):

  | Role | Address |
  | ---- | ------- |
  | pool | `0xde543192e1939Ee2538db77CCc225Aa67412bEa6` — swap, observe, reads |
  | router | `0x8876789976decbfcbbbe364623c63652db8c0904` — UniversalRouter, Blockscout-verified, immutable (proxy slot zero), 24,546 B |
  | permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` — canonical; runtime differs from Ethereum in 39 bytes (immutables only) |
  | WETH9 | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` — deposit / withdraw |
  | NFPM | `0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3` — LP position |
  | miner | deployed `BuffCatMiner` — `fundEthDividends` |
  | DEAD | `0x000000000000000000000000000000000000dEaD` — burn |

  > **HAZARD: router look-alikes exist on this chain.**
  > `0x65050a9b7e5075a2ba5ced7b1b64ee66262c40dc` is an upgradeable
  > TransparentUpgradeableProxy (752 B) that trades against this pool and is
  > NOT a router. Never resolve the router by sampling a recent swap.

  Approvals to the router are EXACT-AMOUNT and SHORT-EXPIRY via Permit2.
  Never a max approval.


### Frontend (post-`web/` restructure, commit 0b83989)

- `web/miner/mining.html` / `mining.js` / `mining.css` — the miner app.
  `mining.js` holds a hand-written ABI fragment that MUST match the deployed
  contract.
- `web/miner/cat-drag.js` — miner-only interaction.
- `web/marketing/index.html` / `buffcat-robinhood.js` — the token marketing
  site (separate from the miner app).
- `web/shared/buffcat-robinhood.css` — stylesheet loaded by BOTH pages.
- `web/shared/theme.js` — theme system, loaded by both pages.
- `vercel.json` — rewrites `/` → marketing and `/mining` → miner so the public
  URLs are unchanged by the move. Also carries the CSP.
- `assets/` — images and memes. Untouched by the restructure.

### Quarantine / non-authoritative (does NOT define behavior)

Moved to `legacy/` in commit 5f05020. Retained for history only.

- `legacy/contracts/BuffCatMiner.sol` — a DIFFERENT, superseded contract
  (2% buy fee 1% LP / 1% eco, `Ownable2Step`, `Tier` enum,
  `notifyRewardAmount`, on-contract LP ETH reserve). NOT deployed, NOT tested,
  NOT audited. Its economics contradict the live design.
- `legacy/hardhat.config.js`, `legacy/hardhat.config.offline.js`,
  `legacy/scripts/`, `legacy/BuffCatMiner.test.js`, `legacy/contracts/mocks/`
  — the Hardhat project that compiled the file above. It previously sat at
  `contracts/contracts/`, where Hardhat's default source dir meant a bare
  `npx hardhat` built the WRONG contract. Moving it out removed that path.
  Foundry is the only build/test path.

> Resolved: quarantine (not delete) — history kept, no longer reachable by a
> default Hardhat invocation. Gate after the move: `forge test` 20/20, 3
> invariants at 128,000 calls, 0 reverts.

## Storage Model

- **On-chain contract state** — positions (per user array), accumulators
  (accEthPerShare, accUsdgPerShare, accFeaturedPerShare, accBuffPerShare),
  totalHashpower, featuredHashpower/Pending, buyFeeWei. This is the only
  authoritative state.
- **Frontend** — holds NO authoritative state; reads everything live from
  the contract. No backend, no database. `theme.js` uses localStorage only
  for the light/dark preference.

## Auth and Access Model

- **Ownable** — `owner` (constructor arg) controls: setFeatured, fundFeatured,
  fundEthDividends, fundUsdgDividends, setUsdg, setBuyFee, pause/unpause.
- **Deployer ≠ owner** — the deploy signer and the `owner` arg are separate.
  Testnet: owner = throwaway deployer. Mainnet: owner MUST be a hardware
  wallet or multisig (it can reroute weekly reward flow — a hot EOA is a risk).
- **Users** — permissionless: anyone can lock/claim/unlock/compound their
  own positions. `claim`/`unlock` are per-position (`posId`).

## Invariants (never violate)

1. **The contract is the source of truth; the frontend must conform to it.**
   The `mining.js` ABI + fee/tier logic mirror the deployed contract — never
   the reverse. (This project has drifted here before; guard it.)
2. **100% of locked BUFFCAT principal is returned at unlock.** The buy fee is
   a flat ETH amount paid on top — never skimmed from the BUFFCAT principal.
3. **Solvency:** the contract can always pay out what its accumulators owe;
   dividends are bounded by what was actually funded. (Proven by the 128k-call
   invariant fuzz — keep it passing.)
4. **Any change to BuffCatMiner.sol requires re-running `forge test` (and
   Slither) before it is trusted or committed.**
5. **No mainnet deploy** until testnet click-through (Step 5) AND an
   independent human audit (Step 6) are both complete.
6. **The git repo is the source of truth** — not the Claude project mirror,
   not chat history, not memory. Verify against the repo when in doubt.
7. **Exactly one file defines economic logic.** If a second contract with the
   same name exists anywhere in the tree, it is quarantined and labelled as
   such here, or it is deleted. A same-named contract with different fee math
   is a live hazard, not a harmless leftover.
8. **Value leaves the treasury only to the addresses listed in System
   Boundaries** — pool, router, Permit2, WETH9, position manager, the miner's
   dividend function, or DEAD. All are immutable constructor-set addresses. No
   EOA destination, no owner withdrawal, no arbitrary `call`, no
   `delegatecall`, no upgrade path, no standing or unlimited ERC-20 approval to
   any address. This is the invariant that matters most; asserted by inspection
   AND by 128k-call invariant fuzz.
9. **`circulating = totalSupply() - balanceOf(DEAD)`, with no other
   exclusions.** Binding identically across contract, bot, website, and public
   comms. Treasury-held BUFFCAT is disclosed separately via `treasuryHeld()`
   and never netted out. `totalSupply()` is frozen at 1B and is never cited as
   evidence of a burn.
10. **`totalBurned` counts only burns performed BY this contract.** It is an
    internal counter, never derived from `balanceOf(DEAD)`. A third-party
    burner (`0x9eFdC1A8…EE0417`, funded by the launchpad's `LaunchLocker`) has
    been burning BUFFCAT since ~1 day after launch and continues; the `dEaD`
    balance moves for reasons outside this contract. Any hardcoded baseline is
    a bug.
11. **The treasury LP position is full-range**; tick bounds are immutable
    constants. It is never rebalanced. Liquidity may be decreased only back
    into the treasury, where invariant 8 still binds.
12. **No swap executes without a valid on-chain price reference.** The pool's
    TWAP is the only permitted source (no external oracle). The pool must carry
    sufficient `observationCardinality` before deployment — see
    `treasury-design.md` §11.
