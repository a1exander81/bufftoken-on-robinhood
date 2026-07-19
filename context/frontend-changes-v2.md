# Frontend changes — 6 tiers + dynamic fee

Against `web/miner/mining.js` and `web/miner/mining.html` on `main`.

**These depend on a contract that does not exist yet.** `quoteFee(uint256)` and
`feeBps()` are proposed for BuffCatMiner v2. Do not merge this ahead of Step 2.

---

## 1. mining.js — tier arrays (lines 30-33)

REPLACE:

```js
// 7 tiers, values copied directly from BuffCatMiner.sol (TIER_DURATION / TIER_MULT_BPS)
const TIER_LABELS = ["1 Day", "3 Days", "1 Week", "1 Month", "1 Year", "10 Years", "100 Years"];
const TIER_DURATION_SEC = [86400, 3*86400, 7*86400, 30*86400, 365*86400, 3650*86400, 36500*86400];
const TIER_MULT_BPS = [10000, 12500, 16000, 22000, 35000, 50000, 60000];
```

WITH:

```js
// 6 tiers, capped at 1 year — copied from BuffCatMiner.sol (TIER_DURATION / TIER_MULT_BPS)
const TIER_LABELS = ["1 Day", "1 Week", "1 Month", "3 Months", "6 Months", "1 Year"];
const TIER_DURATION_SEC = [86400, 7*86400, 30*86400, 90*86400, 180*86400, 365*86400];
const TIER_MULT_BPS = [10000, 12500, 16000, 21000, 26000, 32000];
```

## 2. mining.js — ABI (around line 37)

REPLACE:

```js
"function buyFeeWei() view returns (uint256)",
```

WITH:

```js
"function quoteFee(uint256 amount) view returns (uint256)",
"function feeBps() view returns (uint16)",
```

## 3. mining.js — fee state (around lines 26-27)

REPLACE:

```js
let   buyFeeWei = null;                       // BigNumber, for msg.value
```

WITH:

```js
let   quotedFeeWei = null;   // BigNumber, re-quoted whenever the amount changes
let   feeBpsValue  = 100;    // 100 bps = 1%, read from the contract
```

## 4. mining.js — replace the static fee fetch with a live quote

The old code fetched `buyFeeWei()` once on load. The fee now depends on the
amount, so it must be re-quoted as the user types. REPLACE the
`refreshBuyFee()` function with:

```js
  // The fee is a PERCENTAGE of the position, valued via the pool's own
  // 30-minute average price and clamped to hard on-chain bounds. It therefore
  // depends on `amount` and must be re-quoted whenever the input changes.
  async function refreshFeeBps() {
    if (!hasContract) { feeBpsValue = 100; return; }
    try { feeBpsValue = await minerContract(false).feeBps(); }
    catch (_) { feeBpsValue = 100; }
  }

  async function refreshQuote() {
    const amt = parseFloat(amountInput.value || "0");
    if (!hasContract || !(amt > 0)) {
      quotedFeeWei = null;
      return updateBreakdown();
    }
    try {
      const amountWei = ethers.utils.parseUnits(String(amt), 18);
      quotedFeeWei = await minerContract(false).quoteFee(amountWei);
    } catch (_) {
      quotedFeeWei = null;
    }
    updateBreakdown();
  }
```

Debounce it on the amount input (~300ms) so typing does not spam the RPC:

```js
  let quoteTimer = null;
  amountInput.addEventListener("input", () => {
    clearTimeout(quoteTimer);
    quoteTimer = setTimeout(refreshQuote, 300);
  });
```

## 5. mining.js — breakdown display (around line 179)

REPLACE the flat-fee comment and the fee row with:

```js
    // Fee is a PERCENTAGE of position value (default 1%), paid in ETH on top of
    // the lock. It is NOT skimmed from the BUFFCAT principal — 100% of
    // principal is still returned at unlock.
    const feeEth = quotedFeeWei
      ? parseFloat(ethers.utils.formatEther(quotedFeeWei))
      : null;
    el("bdFee").textContent = feeEth === null
      ? "—"
      : `${feeEth.toFixed(5)} ETH  (${(feeBpsValue / 100).toFixed(2)}%)`;
```

## 6. mining.js — the lock call (around line 253)

REPLACE:

```js
        const feeWei = await minerContract(false).buyFeeWei();
        const tx2 = await miner.lock(amountWei, selectedTier, selectedChoice, { value: feeWei });
```

WITH:

```js
        // Re-quote immediately before sending: the pool price moves, and a
        // stale quote will revert on-chain.
        const feeWei = await minerContract(false).quoteFee(amountWei);
        const tx2 = await miner.lock(amountWei, selectedTier, selectedChoice, { value: feeWei });
```

## 7. mining.html — tier buttons (lines 104-132)

REPLACE all seven `.mine-tier` buttons with six:

```html
            <div class="mine-tiers" id="tierPicker">
              <button class="mine-tier active" data-tier="0">
                <div class="tier-label">1 Day</div>
                <div class="tier-mult">1.00x hashpower</div>
              </button>
              <button class="mine-tier" data-tier="1">
                <div class="tier-label">1 Week</div>
                <div class="tier-mult">1.25x hashpower</div>
              </button>
              <button class="mine-tier" data-tier="2">
                <div class="tier-label">1 Month</div>
                <div class="tier-mult">1.60x hashpower</div>
              </button>
              <button class="mine-tier" data-tier="3">
                <div class="tier-label">3 Months</div>
                <div class="tier-mult">2.10x hashpower</div>
              </button>
              <button class="mine-tier" data-tier="4">
                <div class="tier-label">6 Months</div>
                <div class="tier-mult">2.60x hashpower</div>
              </button>
              <button class="mine-tier" data-tier="5">
                <div class="tier-label">1 Year</div>
                <div class="tier-mult">3.20x hashpower</div>
              </button>
            </div>
```

## 8. mining.html — copy fixes

Line 62 — the stat is no longer a fixed ETH amount:

```html
<div class="mine-stat"><div class="label">Lock Fee</div><div class="value green" id="statLockFee">—</div></div>
```

Line 147 — the breakdown row:

```html
<div class="row"><span>Lock fee</span><span id="bdFee">—</span></div>
```

Line 153 — the note is wrong under the new model. REPLACE:

> The ETH lock fee can be adjusted by the contract owner, but only within fixed
> on-chain bounds (0.0005-0.05 ETH).

WITH:

> The lock fee is a percentage of your position, paid in ETH on top of it. Your
> BUFFCAT principal is never touched and is returned in full at unlock. The
> percentage is owner-adjustable within fixed on-chain bounds, and every fee is
> clamped between 0.0005 and 0.05 ETH.

## 9. Still outstanding (unchanged by this work)

- `MINER_ADDRESS` is `""` and `ROBINHOOD_CHAIN_ID` is `0x1237`. /mining is a
  dead public surface until the v2 address exists.
- Pointing at testnet also requires widening `connect-src` in `vercel.json`,
  which is currently mainnet-only.
- The dividend `choice` selector (ETH / USDG / featured) is still not built;
  locks default to choice 0.

## 10. Sequencing

Per the scoping rule, contract work and frontend rewire are separate units.
Order: BuffCatMiner v2 through Steps 2-5, then this, as its own change.
