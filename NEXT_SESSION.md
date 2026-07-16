# Next Session — Start Here

## 0. Context (read once)
BuffCat Miner: lock BUFFCAT → earn ETH/USDG/featured dividends. Contract is
BUILT and TESTED (20/20, incl. 128k-call invariant fuzz), COMMITTED to git,
but NOT deployed, NOT audited, holds NO real funds. We are at Step 4 of 7.

## 1. Verify reference files are fresh (do this FIRST)
```
grep -n "buyFeeWei" mining.js
grep -c "theme.js" index.html
grep -n "css?v=" index.html mining.html
```
- Expect: `buyFeeWei` present (NOT `BUY_FEE_BPS`), `theme.js` = 1, recent css version.
- If you still see `BUY_FEE_BPS = 200` or `theme.js` = 0 → project reference
  files are STALE. They can only be refreshed via Project settings (delete +
  re-upload), NOT by uploading into chat. Until then, work from the git repo
  or pasted `cat` output — never trust /mnt/project.

## 2. Confirm real repo state (source of truth, not these files)
```
cd ~/Desktop/bufftoken-on-robinhood
git log --oneline -5
git status
git branch --show-current    # should be: feature/buffcat-miner
```

## 3. Read, in order
1. `PROGRESS.md` — 7-step ritual, what's done, what's next
2. `contracts/src/BuffCatMiner.sol` — the contract (if not in project files, ask user to paste)
3. `contracts/test/*.sol` — what's already proven

## 4. Next action → Step 4: Slither
```
cd ~/Desktop/bufftoken-on-robinhood/contracts
pip3 install slither-analyzer
slither src/BuffCatMiner.sol
```
Triage findings. Fix high/medium, or accept with a written reason in PROGRESS.md.
Do NOT move to testnet until this is clean.

## 5. After Slither → the rest of the ritual
- Step 5: testnet deploy + Blockscout verify + test NVDA fund/distribute end-to-end
- Step 6: human audit (NOT optional — Claude testing is not an audit)
- Step 7: mainnet + wire mining.html/js to the live address

## Hard rules (never break)
- No uploaded file is trustworthy without the Step 1 freshness check.
- NEVER paste .env / private keys / seed phrases into chat.
- Any contract change → re-run `forge test` before trusting it.
- No mainnet until Steps 5 AND 6 are done.
- The git repo is the source of truth. Not these files, not Claude's memory.

## Known open loose ends (from last session)
- Connect wallet: works over http, but never hardened (EIP-6963 pending). Low priority.
- Project reference files kept going stale — fix is Project-settings upload, not chat upload.
- NVDA transferability by a contract: assumed OK (reference contract proves it),
  but MUST be confirmed live on testnet before any NVDA featured campaign.
