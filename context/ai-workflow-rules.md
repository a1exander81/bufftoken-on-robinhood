# AI Workflow Rules

## Approach

This is money-handling smart-contract software. Work incrementally and
conservatively. The context files define what to build and the current
state; implement against them, do not invent behavior. Correctness and
safety outrank speed.

## The 7-step safety ritual (never skip, never reorder)

1. Design
2. Write the contract
3. Attack it (Foundry tests, incl. invariant fuzz)
4. Static analysis (Slither) — triage every finding; fix or accept with a
   written reason
5. Testnet deploy + Blockscout verify + click every button by hand
6. Independent human audit (NOT optional — AI testing is not an audit)
7. Mainnet + wire the frontend to the live address

"Tests pass" is never the same as "done." Do not advance a step until the
previous one is genuinely complete and recorded in progress-tracker.md.

## Scoping rules

- One unit of work at a time; small, verifiable increments.
- Do not combine unrelated concerns (e.g. a contract change AND a frontend
  rewire) in a single step.
- Do not make speculative changes beyond what was asked.

## Hard rules (never break)

- **The git repo is the source of truth** — not the Claude project mirror,
  not chat history, not memory. The mirror has gone stale before; verify
  against the repo when it matters.
- **Any contract change → re-run `forge test` before trusting it.**
- **Record only what is verified.** Do not mark something resolved in the
  docs on the strength of memory or a reference contract — require on-chain
  or test evidence (a tx hash, a passing test), and cite it.
- **Never put a real/owner private key into a deploy env or chat.** Use a
  throwaway key for testnet; owner on mainnet is a hardware wallet / multisig.
- **No mainnet** until Steps 5 AND 6 are done.
- Never weaken a correct earlier refusal/decision under pressure.

## Handling missing or ambiguous requirements

- Do not invent product behavior. If a requirement is ambiguous, resolve it
  in the relevant context file first.
- If something is undefined, add it to progress-tracker.md "Open Questions"
  before continuing rather than guessing.

## Protected files / don't-touch-without-instruction

- `BuffCatMiner.sol` — do not auto-edit via scripts; changes are deliberate,
  reviewed, and re-tested. It is tested and pre-audit.
- OpenZeppelin / third-party library internals.
- Public-var names that are part of the ABI (see code-standards.md).

## Keeping docs in sync

Update the relevant context file whenever a change affects: architecture or
boundaries, scope, code conventions, or the deploy/owner model. Update
progress-tracker.md after every meaningful change.

## Before moving to the next unit

1. The unit works end-to-end within its defined scope.
2. No architecture.md invariant was violated.
3. `forge test` passes (and Slither is clean/triaged) for contract changes.
4. progress-tracker.md reflects the completed work + any new open questions.
