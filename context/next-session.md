# Next Session — Website + Structure + Review Pipeline

Read this first, then `context/progress-tracker.md`. The git repo is the source
of truth. This session is a NEW scope (the main website + project structure),
separate from the miner's Step 5 testnet work, which is still open — don't
tangle the two.

## 0. Do these safety checks FIRST (5 min)

- [ ] `git ls-files | grep -i env` — if `.env.local` (or any env file) is
      TRACKED, it's exposed. Add to `.gitignore`, `git rm --cached` it, and
      rotate anything inside. (There is a `.env.local` in the root per the file
      tree — verify it is NOT committed.)
- [ ] `cast wallet address --account throwaway` → must print `0x897D…ef37`
      (testnet key still available).
- [ ] Confirm shell history was cleared of the old exposed key
      (`0xc241…5596`); if not: `cat /dev/null > ~/.zsh_history && exec zsh`.

## 1. Confirmed current stack (as of this session)

- **Contract (the real backend):** Solidity + Foundry — `contracts/`
  (`src/`, `test/`, `script/`), OpenZeppelin deps. Deployed to testnet.
- **Frontend:** STATIC HTML/CSS/vanilla-JS. No framework, no build step, no
  bundler, no Node server, no database. ethers 5.7.2 via script tag.
- **Web3:** ethers 5.7.2 (vendored).
- **Hosting:** Vercel (static). `vercel.json`.
- **Two frontends in one repo:** the marketing/token site (`index.html` +
  `buffcat-robinhood.{js,css}` + `cat-drag.js` + `theme.js`) and the miner app
  (`mining.html` + `mining.{js,css}`).

Takeaway: this is **static frontend + on-chain contract**, NOT full-stack.
For a dApp that's a legitimate, secure architecture — the chain is the state
layer, so there's no server to hack or DB to leak.

## 2. DECISION TO MAKE FIRST — what does "full stack" mean here?

Do not start building until this is answered, because it changes everything:

- **(a) Stay static, structure it well** (recommended default) — no server;
  just reorganize + harden the existing static site. Lowest risk.
- **(b) Add a real backend** (API + DB) — only if there's a concrete need:
  user accounts, off-chain analytics, campaign metadata, an indexer, etc.
  Adds real breakage/security surface — the opposite of "unbreakable."
- **(c) Adopt a frontend framework/build step** (e.g. Vite + a light
  framework) — better structure/DX, still static output, no server.

Note on "unbreakable": nothing is literally unbreakable — aim for ROBUST and
VERIFIED (clear structure, no fragile interdependencies, tested/reviewed
changes), not a promise of perfection.

## 3. Structure reorg (its own PR)

Current problem: the repo ROOT is a dumping ground — both HTML entry points,
all CSS/JS, docs, and `.bak` files sit loose at top level with no separation
between marketing site / miner app / shared assets.

The folders that already exist are fine: `contracts/`, `context/`, `assets/`,
`vendor/`. The mess is only the root-level frontend sprawl.

Proposed target (confirm before moving — moving files breaks relative paths in
HTML/JS/CSS, so this must be done carefully and tested in-browser after):
```
web/
  marketing/   index.html, buffcat-robinhood.{js,css}, cat-drag.js
  miner/       mining.html, mining.{js,css}
  shared/      theme.js, (ethers if kept local)
assets/        images / memes (UNCHANGED — see constraint below)
contracts/     (unchanged)
context/       (unchanged)
```
Adjust `vercel.json` routes after moving. Delete the `.bak.*` files (already
gitignored) once confirmed unneeded.

## 4. Website UI fix (its own PR) — HARD CONSTRAINTS

- User will provide **UI reference(s)** (links/screenshots) — fix the UI
  against those.
- **Preserve every image and the meme character.** Do NOT strip, replace, or
  "clean up" the images or the meme personality. Improve execution/layout, keep
  the identity. This is a non-negotiable requirement from the user.
- Keep the existing color tokens (Robinhood green `#00C805` on `#06080B`, gold
  accents) and the dark/light/auto theme system unless the references
  deliberately change them.
- Confirm the marketing site vs miner app split — decide which the references
  apply to.

## 5. Review pipeline — CodeRabbit + scoped PRs

- Install the **CodeRabbit GitHub app** on the repo (AI PR reviewer — a second
  automated reviewer on top of Slither; reviews Solidity + JS + docs in a PR).
- Workflow: open PRs from `feature/buffcat-miner` (or new branches) → `main`;
  CodeRabbit auto-reviews the diff.
- **Scope PRs small** so reviews are focused, not one giant "everything since
  main" PR. Suggested split:
  1. Structure reorg (§3)
  2. Website UI fix (§4)
  3. (later) miner Step-5 continuation
- This fits the project's "nothing ships unreviewed" discipline.

## 6. Still open from the miner track (do NOT lose)

- Stock-Token OUT-direction: featured `claim(posId)` after MIN_HOLD (24h) —
  proves the token moves OUT (the IN direction is already proven on testnet,
  tx `0xa9c7249e...508ecd59`).
- Point `mining.js` at testnet (chain 46630) + set MINER_ADDRESS
  (`0xEcd9e1E717D6628513E1E555702ED21a222872A5`).
- Blockscout-verify the contract. Full click-through + soak. Then Steps 6–7.

## 7. Claude-side housekeeping (not git)

- Re-upload the six `context/` files into Claude Project settings (they're
  still blank templates in the project mirror).
- Paste the read-order instruction into Project custom-instructions so the
  context files load automatically each session.
