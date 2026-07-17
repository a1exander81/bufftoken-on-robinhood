# Code Standards

## General

- Fix root causes, not symptoms. Do not layer workarounds over a bug in the
  contract or the ABI — correct the source.
- Keep the contract as the single implementation of economic logic. The
  frontend reads and displays; it never re-derives the math independently.
- Prefer small, verifiable changes. Every contract change is followed by
  `forge test`.

## Solidity (contracts/)

- Pragma `^0.8.24`; Foundry project layout (`src/`, `test/`, `script/`).
- Use OpenZeppelin primitives (SafeERC20 for all token transfers, Ownable,
  Pausable, ReentrancyGuard) rather than re-implementing.
- Follow checks-effects-interactions; state writes before external calls.
  ETH sends use `.call{value:}("")` with the returned bool checked (not
  `.transfer`). This is intentional — Slither flags it as informational only.
- Every owner/funder state change emits an event (setBuyFee, fundUsdgDividends,
  fundFeatured, etc.) — this was a Slither fix; keep it.
- Accumulator math uses the ACC = 1e18 scaling pattern; the divide-before-
  multiply Slither warnings on it are accepted false positives (precision is
  bounded, corroborated by the invariant fuzz). Do not "fix" them.
- Public state vars `TIER_DURATION` / `TIER_MULT_BPS` are UPPER_CASE by
  intent — renaming changes the ABI and breaks the frontend. Do not rename.

## Frontend JS (mining.js, etc.)

- Vanilla ES, no framework, no bundler. ethers 5.7.2 UMD global.
- The `MINER_ABI` fragment in `mining.js` MUST match the deployed contract
  exactly (function names, arg counts, tuple shapes). When the contract
  changes, update the ABI in the same change.
- Read all on-chain state live; hold no authoritative state in JS.
- Handle both network states: no-wallet, wrong-chain, no-contract-yet.

## Styling

- Use the `--token` CSS custom properties from `ui-context.md`. No hardcoded
  hex. New colors are added as tokens in BOTH `:root` and
  `:root[data-theme="light"]`.

## Testing / verification

- Contract: `forge test` (must stay 20/20 incl. the 128k-call invariants),
  then `slither .` for static analysis.
- No `npm run build` — this is not a Node/TS project. "Build passes" means
  `forge build` compiles and tests pass.

## File organization

- `contracts/src/` — the contract.
- `contracts/test/` — Foundry tests + Mocks.sol.
- `contracts/script/` — deploy scripts.
- Root `*.html/.js/.css` — the frontend + marketing site.
- `context/` — these six context docs (source of session-to-session truth).
