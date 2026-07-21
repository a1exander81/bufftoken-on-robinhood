# BuffCat Miner — Agent Context

Read these files in order before implementing or making any architectural
decision:

1. `context/project-overview.md` — product definition, goals, scope
2. `context/architecture.md` — stack, boundaries, invariants
3. `context/ui-context.md` — theme, color tokens, conventions
4. `context/code-standards.md` — Solidity + vanilla-JS rules
5. `context/ai-workflow-rules.md` — the 7-step safety ritual, scoping, hard rules
6. `context/progress-tracker.md` — current phase, what's done, open questions
7. `context/next-session.md` — where the last session stopped, blockers
8. `context/treasury-design.md` — Track B: the treasury vault design
9. `context/miner-v2-design.md` — Track C: multi-pool miner + seeding round
10. `context/session-runbook.md` — command-by-command operational guide

Not part of the read order: `context/frontend-changes-v2.md` is a staged patch
for a contract that does not exist yet. **Do not merge it.**

Update `context/progress-tracker.md` after each meaningful change. If a change
affects architecture, scope, or standards, update the relevant context file
before continuing.

## Non-negotiables (see ai-workflow-rules.md for the full list)

- The git repo is the source of truth — not memory, not chat, not any mirror.
- This is money-handling, pre-audit software. Never skip the 7-step ritual.
- Any change to `BuffCatMiner.sol` → re-run `forge test` before trusting it.
- Record only verified facts (cite a tx hash or passing test).
- No real/owner private keys in deploy envs or chat. No mainnet before an
  independent human audit.
