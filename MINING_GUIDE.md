# 💪 Buff Cat Mining — How to View & Claim Your Rewards

A plain-English guide to the $BUFFCAT miner. No hardware, no electricity bill —
"mining" here means locking $BUFFCAT into the BuffCatMiner contract and earning
a share of its reward stream. The longer you lock, the bigger your share.

---

## What you need before starting

1. **A wallet** (MetaMask, Rabby, etc.) with the **Robinhood Chain** network
   added. The mining page can add it for you when you connect.
2. **A little ETH on Robinhood Chain** for gas. Every action (buy, claim,
   unstake) is a transaction and needs gas.
3. **Some $BUFFCAT** — grab it on Uniswap v3 via the Buy button on the site.

---

## Step 1 — Buy miners (lock your $BUFFCAT)

1. Open the **Mining** page and hit **Connect**.
2. Enter the amount of $BUFFCAT and pick a lock tier:

   | Tier   | Lock time | Mining power |
   |--------|-----------|--------------|
   | Day    | 24 hours  | 1.0×         |
   | 3-Day  | 3 days    | 1.2×         |
   | Week   | 7 days    | 1.5×         |
   | Month  | 30 days   | 2.0×         |

3. Approve the token (first time only), then confirm the buy.

A **3% fee** is taken when you buy (1% liquidity / 1% platform / 1% ecosystem).
The other 97% becomes your locked principal — you get it back when you unstake.
Your **mining power** = principal × tier multiplier. Rewards are split among
all miners in proportion to mining power, so a Month lock earns twice as fast
as a Day lock of the same size.

---

## Step 2 — View your rewards

### The easy way: the mining dashboard

1. Open the **Mining** page and connect your wallet.
2. The **Pending rewards** card shows your unclaimed $BUFFCAT, updating live.
3. Your open positions are listed below it, each with its lock tier, locked
   amount, and unlock date.

### The trustless way: the block explorer

You don't have to trust our website — the chain itself will tell you:

1. Open the contract on the explorer:
   `https://robinhoodchain.blockscout.com/address/<MINER_CONTRACT_ADDRESS>`
   (the exact address is shown at the top of the mining dashboard).
2. Go to **Contract → Read Contract**.
3. Find **`pendingRewards`**, paste your wallet address, hit **Query**.
4. The number returned is your unclaimed reward in raw units — divide by
   10¹⁸ (move the decimal point 18 places left) to get $BUFFCAT.
   Example: `2500000000000000000000` = 2,500 $BUFFCAT.

Also useful on the Read tab:
- **`earned`** — same as pendingRewards.
- **`positions`** — your address + a position number (0, 1, 2…) shows that
  position's locked amount and unlock timestamp.
- **`rewardPeriodFinish`** — when the current reward stream ends
  (a Unix timestamp; paste it into unixtimestamp.com).

---

## Step 3 — Claim your rewards

### On the dashboard

1. Connect your wallet on the **Mining** page.
2. Press **Claim** and confirm the transaction.
3. A **3% fee** comes off the claim — you receive 97% straight to your wallet.
   Claiming does **not** touch your locked principal; your miners keep mining.

### On the explorer (works even if the website is down)

1. Open the contract page → **Contract → Write Contract**.
2. Press **Connect wallet**.
3. Find **`claimDividends`** (it takes no inputs), press **Write**, confirm.

Claim whenever you like — rewards never expire while the contract holds them.
Small tip: each claim costs gas, so letting rewards build up and claiming
less often keeps more in your pocket.

---

## Step 4 — Unstake (get your principal back)

- **After your lock expires:** unstake returns **100% of your principal** —
  no fee, no penalty. Use the position's **Unstake** button on the dashboard,
  or `unstake(positionId)` on the explorer's Write tab.
- **Before your lock expires:** you can rage-quit early, but it costs a
  **10% penalty**: 3% goes to the standard fee split, and the other 7% is
  poured back into the reward stream for the miners who stayed. Diamond paws
  get paid; paper paws pay them.

Unstaking automatically stops that position's mining power. Unclaimed rewards
stay claimable — run a claim afterwards to collect them.

---

## FAQ

**My pending rewards aren't going up.**
The reward stream runs on a schedule funded by the team. If
`rewardPeriodFinish` is in the past, the current stream has ended — rewards
already earned are safe and claimable, and accrual resumes when the next
stream is funded.

**Why did I receive slightly less than the dashboard showed?**
The 3% claim fee. The dashboard shows your gross accrued rewards; your wallet
receives 97% of it.

**Can the team take my locked tokens?**
No. The contract has no function to move user principal or promised rewards.
The owner can only *add* reward funding and pause *new* deposits. Fee wallets
are burned into the contract at deployment and can never be redirected.

**Is my yield paid from other people's deposits?**
No. Rewards come only from tokens the team deposits into the stream plus
penalties from early exits. The contract enforces that it always holds enough
tokens to cover every promise it has made — this invariant is covered by the
automated test suite.

**I have several positions — do they share one reward balance?**
Yes. All your positions feed one pending-rewards balance, and one claim
collects everything. Unstaking is per-position.

---

*Stay swole. This is a meme project — nothing here is financial advice. DYOR.*
