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

- `contracts/contracts/BuffCatMiner.sol` — a DIFFERENT, legacy contract
  (2% buy fee 1% LP / 1% eco, `Ownable2Step`, `Tier` enum,
  `notifyRewardAmount`, on-contract LP ETH reserve). It is NOT deployed, NOT
  the tested contract, and its economics contradict the live design. It exists
  only as history.
- `contracts/hardhat.config.js`, `contracts/scripts/`,
  `contracts/test/BuffCatMiner.test.js`, `contracts/contracts/mocks/` — the
  legacy Hardhat project that compiles the file above. Hardhat's default source
  dir is `contracts/contracts/`, so running Hardhat here builds the WRONG
  contract. Do not use it. Foundry is the only build/test path.

> Pending decision (see progress-tracker.md): delete this quarantine set, or
> move it to `legacy/` with a README. Until then, treat any reference to
> "BuffCatMiner.sol" without a full path as ambiguous and resolve it to
> `contracts/src/`.

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
