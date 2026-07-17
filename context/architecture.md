# Architecture Context

## Stack

| Layer            | Technology                                  | Role                                                        |
| ---------------- | ------------------------------------------- | ----------------------------------------------------------- |
| Smart contract   | Solidity ^0.8.24, Foundry (forge)           | Core logic: locking, dividends, featured campaigns, fees    |
| Contract deps    | OpenZeppelin (IERC20, SafeERC20, Ownable, Pausable, ReentrancyGuard) | Battle-tested primitives |
| Chain            | Robinhood Chain (Arbitrum Orbit L2)         | Mainnet chain 4663; testnet chain 46630; gas token = ETH    |
| Frontend         | Static HTML + vanilla JS (no framework)     | UI; no build step                                           |
| Web3 lib         | ethers.js 5.7.2 (UMD, loaded via script tag)| Wallet + contract calls                                     |
| Hosting          | Vercel (vercel.json)                         | Static hosting                                              |
| Explorer/verify  | Blockscout                                   | Contract verification + inspection                          |

## System Boundaries

- `contracts/src/BuffCatMiner.sol` — THE contract. Single source of truth
  for all economic logic. Nothing else may re-implement its math.
- `contracts/test/*.sol` — Foundry tests (unit, attacks, compound, featured,
  hostile-token, invariant). The proof the contract is correct.
- `contracts/script/` — deploy scripts (DeployTestnet.s.sol).
- `mining.html` / `mining.js` / `mining.css` — the miner frontend. `mining.js`
  holds a hand-written ABI fragment that MUST match the deployed contract.
- `index.html` / `buffcat-robinhood.{js,css}` / `cat-drag.js` / `theme.js` —
  the main token marketing site (separate from the miner app).

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
