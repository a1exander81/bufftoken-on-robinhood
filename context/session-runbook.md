# Session Runbook — Website + Structure + CodeRabbit

Command-by-command guide for the next session. Paste blocks one at a time.
Legend:  🖥 = run in Terminal   ·   🧠 = a DECISION (no command)   ·
🌐 = browser/GitHub action   ·   ⚠️ = don't run blindly, read the note.

Pair this with `context/next-session.md` (the why) and
`context/progress-tracker.md` (current state). Git repo = source of truth.

---

## Phase 0 — Orientation

🖥 Land in the repo and see where things stand:
```
cd ~/Desktop/bufftoken-on-robinhood
git status
git log --oneline -8
git branch --show-current      # expect: feature/buffcat-miner
```

🖥 Re-read the plan + tracker (they scrolled out of the terminal is fine —
open in the editor, or):
```
cat context/next-session.md
cat context/progress-tracker.md
```

🖥 Re-export the session vars (a new terminal loses them):
```
export RH_TESTNET_RPC=https://rpc.testnet.chain.robinhood.com
export MINER=0xEcd9e1E717D6628513E1E555702ED21a222872A5
export BUFF=0xaBf15C76b8BB5493fb51DC5b8a625574486C5F67
export STOCK=0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E   # RH-TSLA (test stock token)
```

---

## Phase 1 — Safety checks (do FIRST, ~5 min)

⚠️🖥 Is any env file tracked by git? (It must NOT be.)
```
git ls-files | grep -i env
```
- If it prints nothing → good, skip the next block.
- If it prints `.env.local` (or similar) → it's exposed. Untrack + ignore it,
  then ROTATE anything inside:
```
git rm --cached .env.local
echo ".env.local" >> .gitignore
echo ".env" >> .gitignore
git add .gitignore
git commit -m "chore: stop tracking env files"
git push origin feature/buffcat-miner
```

🖥 Confirm the testnet throwaway key still resolves:
```
cast wallet address --account throwaway     # must print 0x897D…ef37
```

🖥 Clear the old exposed key from shell history if not done:
```
cat /dev/null > ~/.zsh_history && exec zsh
```

---

## Phase 2 — The full-stack decision (do BEFORE building)

🧠 Decide what "full stack" means here. Pick one, tell Claude:
- (a) Stay static, structure it well  ← recommended default, lowest risk
- (b) Add a real backend (API + DB)   ← only for a concrete need (accounts,
      analytics, indexer); adds breakage/security surface
- (c) Add a build step / framework (e.g. Vite)  ← better DX, still static

Nothing below assumes a backend. If (b), stop and design it with Claude first.

---

## Phase 3 — Make a scoped branch for this work

🖥 Don't pile website work onto the miner branch. Branch off:
```
git checkout main
git pull origin main
git checkout -b feature/website-restructure
```
(If you'd rather keep building on feature/buffcat-miner, skip this — but a
clean branch = a clean, focused CodeRabbit PR.)

---

## Phase 4 — Structure reorg  ⚠️ (its own PR, done carefully)

⚠️ Moving files BREAKS every relative path in the HTML/CSS/JS and the
vercel.json routes. This is NOT a fire-and-forget script. Do it with Claude,
step by step, testing in the browser after each move. The blocks below are the
mechanism, not a blind run.

🖥 First, SEE every relative reference that a move would break:
```
grep -rn 'src=\|href=\|url(' index.html mining.html \
  buffcat-robinhood.css mining.css theme.js 2>/dev/null
```

🧠 Confirm the target layout with Claude before moving anything. Working
proposal (assets/ stays put so images/memes are untouched):
```
web/marketing/   index.html, buffcat-robinhood.{js,css}, cat-drag.js
web/miner/       mining.html, mining.{js,css}
web/shared/      theme.js
assets/          images / memes  (UNCHANGED)
```

🖥 Use `git mv` (preserves history) once the layout is agreed — example:
```
mkdir -p web/marketing web/miner web/shared
git mv index.html buffcat-robinhood.css buffcat-robinhood.js cat-drag.js web/marketing/
git mv mining.html mining.css mining.js web/miner/
git mv theme.js web/shared/
```

🖥 Then FIX the paths Claude identifies (in the HTML/CSS), update vercel.json
routes, and preview locally before committing:
```
python3 -m http.server 8000
# open http://localhost:8000/web/marketing/index.html  (and the miner page)
# click around: theme toggle, images load, wallet connect, nav links
# Ctrl-C to stop the server
```

🖥 Only when it works in the browser:
```
git add -A
git commit -m "refactor: reorganize frontend into web/ (marketing + miner + shared)"
git push origin feature/website-restructure
```

🖥 Delete the leftover backups (already gitignored) once you're happy:
```
rm -f *.bak.* contracts/src/*.bak.*
```

---

## Phase 5 — CodeRabbit + open the PR

🌐 One-time: install the CodeRabbit GitHub app on the repo —
https://github.com/apps/coderabbitai → Install → select
`a1exander81/bufftoken-on-robinhood`.

🖥 Is the GitHub CLI installed? (optional but easiest for PRs)
```
gh --version || brew install gh
gh auth status || gh auth login
```

🖥 Open the PR (CodeRabbit auto-reviews it):
```
gh pr create --base main --head feature/website-restructure \
  --title "Restructure frontend into web/ layout" \
  --body "Moves marketing + miner frontends into web/. No behavior change; paths + vercel.json updated. Assets untouched."
```
🌐 Or, without gh: open the URL GitHub prints on `git push` and click
"Compare & pull request".

⚠️ Keep PRs SMALL and scoped (structure reorg = one PR, UI fix = another).
One giant "everything" PR gets an unfocused CodeRabbit review.

---

## Phase 6 — Website UI fix  🧠 (its own branch + PR)

🧠 Give Claude the UI reference(s) (links/screenshots) at the start.
HARD CONSTRAINTS (non-negotiable):
- Preserve EVERY image and the meme character. Improve layout/execution, keep
  the identity. Do not strip or "clean up" the memes.
- Keep the color tokens (green #00C805 on #06080B, gold) + theme system unless
  the reference deliberately changes them.
- Confirm: does the reference apply to the marketing site, the miner app, or both?

🖥 New branch + the same local-preview loop while iterating:
```
git checkout -b feature/website-ui
python3 -m http.server 8000    # preview as you go; Ctrl-C to stop
```
🖥 Commit + PR when a coherent chunk is done (repeat per chunk):
```
git add -A
git commit -m "ui: <what changed>"
git push origin feature/website-ui
gh pr create --base main --head feature/website-ui --title "Website UI pass" --body "UI fixes against reference. Images + meme character preserved."
```

---

## Phase 7 — Still-open MINER work (don't lose it)

The Stock-Token OUT-direction test (the other half of the transfer question).
Only after the featured position (posId 0) has passed MIN_HOLD = 24h from its
lock on 2026-07-17.

🖥 Check pending featured dividends first (should be > 0 after 24h + a fund):
```
cast call $MINER "pendingRewards(address,uint256)(uint256,uint256,uint256)" \
  0x897D60882FE0d15cD81b6631462891Af38b3ef37 0 --rpc-url "$RH_TESTNET_RPC"
```
🖥 Note your TSLA balance, then claim, then check it went UP (proves OUT transfer):
```
cast call $STOCK "balanceOf(address)(uint256)" 0x897D60882FE0d15cD81b6631462891Af38b3ef37 --rpc-url "$RH_TESTNET_RPC"
cast send $MINER "claim(uint256)" 0 --gas-limit 300000 --rpc-url "$RH_TESTNET_RPC" --account throwaway
cast call $STOCK "balanceOf(address)(uint256)" 0x897D60882FE0d15cD81b6631462891Af38b3ef37 --rpc-url "$RH_TESTNET_RPC"
```
✅ Balance up + status 1 = Stock Token moves OUT fine → close the loose end in
progress-tracker.md with the tx hash.

Other miner to-dos (see tracker): point mining.js at testnet (chain 46630,
MINER_ADDRESS = $MINER); Blockscout-verify; full click-through + soak.

---

## Phase 8 — Wrap the session

🖥 Update the tracker + commit everything:
```
cd ~/Desktop/bufftoken-on-robinhood
git status
# (Claude drafts the progress-tracker update; copy it in, then:)
git add -A
git commit -m "docs: update progress-tracker (<session summary>)"
git push
```
🌐 Confirm PRs are open and CodeRabbit has commented; address its findings the
same way as Slither (fix, or accept with a written reason).

🌐 Claude-side: re-upload the `context/` files into Project settings so the
mirror matches the repo; keep the read-order instruction in custom-instructions.

⚠️ No mainnet. Steps 6 (human audit) + 7 still gate it.
```
