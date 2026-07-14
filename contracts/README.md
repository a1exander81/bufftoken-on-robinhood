# BuffCatMiner contracts

## Setup

```
cd contracts
npm install
npx hardhat compile
npx hardhat test
```

If `npx hardhat compile` fails to reach `binaries.soliditylang.org` (e.g. in a
network-restricted sandbox), use the offline config, which compiles with the
`solc` package from `node_modules` instead of downloading a compiler:

```
npx hardhat --config hardhat.config.offline.js test
```

On a normal machine with open internet access this isn't necessary; Hardhat
downloads the compiler itself.

## Deploying

```
ADMIN_ADDRESS=0x... \
DEPLOYER_PRIVATE_KEY=0x... \
npx hardhat run scripts/deploy.js --network robinhoodChain
```

`scripts/deploy.js` defaults the token/fee-wallet addresses to the ones
already in use on the live site. Override any of them with
`BUFFCAT_TOKEN_ADDRESS`, `LP_WALLET_ADDRESS`, `OWNER_FEE_WALLET_ADDRESS`,
`ECO_WALLET_ADDRESS` if they ever change.

ETH fee economics (also env-overridable): `BUY_FEE_ETH` (default `0.0005`,
the fixed ETH charged per buy), `LP_ETH_THRESHOLD` (default `0.25`) and
`LP_ETH_INTERVAL_DAYS` (default `7`) — the reserve release rule.

## Verifying on the explorer (Blockscout)

Verification publishes the source code on
[robinhoodchain.blockscout.com](https://robinhoodchain.blockscout.com) so
anyone can read the contract and use the explorer's Read/Write tabs. The
eight arguments must be exactly the ones printed by the deploy script:

```
npx hardhat verify --network robinhoodChain <MINER_ADDRESS> \
  <BUFFCAT_TOKEN> <LP_WALLET> <OWNER_FEE_WALLET> <ECO_WALLET> <ADMIN> \
  <BUY_FEE_ETH_WEI> <LP_ETH_THRESHOLD_WEI> <LP_ETH_INTERVAL_SECONDS>
```

With the current defaults from `scripts/deploy.js` (replace the miner
address and admin with your own; the last three are 0.0005 ETH, 0.25 ETH
and 7 days expressed in wei/seconds):

```
npx hardhat verify --network robinhoodChain 0xYOUR_MINER_ADDRESS \
  0xD80aFe3Be875a14155FDd96D39669A6734E12036 \
  0x78a851D19E2152bB7162d8924CB2Bd088aca95C8 \
  0xc2413696576176d1e31D55a2DEdA609906a15596 \
  0x13864051772FDFBce895d21a483eee02edaeB445 \
  0xYOUR_ADMIN_ADDRESS \
  500000000000000 250000000000000000 604800
```

Once verified, the contract page shows a green check, the full source, and
"Read Contract" / "Write Contract" tabs — that's what the mining guide's
explorer instructions rely on.

After deploying:
1. Verify the contract on the Robinhood Chain explorer (see above).
2. As the admin wallet, `approve` BUFFCAT to the contract and call
   `notifyRewardAmount(amount, durationSeconds)` to open the first reward
   stream — the dashboard shows "No active stream" until this happens.
3. Put the deployed address into `MINER_ADDRESS` at the top of `mining.js`
   in the repo root. The dashboard runs in read-only "preview mode" until
   that's set.

## Design notes / assumptions made

- **"1% goes to LP then burn"**: the contract sends that 1% directly to the
  given LP wallet as plain BUFFCAT. It does not perform an on-chain
  swap-and-add-liquidity-then-burn-the-LP-token sequence — that pattern
  (popularized by SafeMoon-style tokens) depends on trusting a DEX router at
  transaction time and is a well-documented source of sandwich/MEV and
  accounting bugs. If you want liquidity added and the LP token burned, do
  it as a manual or multisig-controlled treasury operation from that wallet.
- **Reward funding**: rewards come from `notifyRewardAmount`, called by the
  admin wallet with tokens it already holds/approves, plus forfeited
  principal from early exits. Nothing is funded by other users' deposits.
- **"Pre-selected pairs" (memes, tokenized SPCX/NVDA, etc.)**: v1 is a
  themed display only on the mining page. The contract does not trade or
  weight yield by those pairs' prices. Wiring real oracle-driven yield to
  specific pairs is a separate, larger project (needs a reliable price feed
  per asset and defenses against oracle manipulation) — don't market it as
  live until it's actually built.
- **Early exit (10%)**: 3% follows the standard buy/withdraw fee split
  (1% LP, 1% platform, 1% eco); the remaining 7% is injected into the
  live reward stream for stakers who keep their lock, funded entirely by
  the exiting user's own forfeited principal.
- **Owner powers are deliberately minimal**: fund the reward stream, pause
  new deposits. There is no function that can move user principal or
  already-committed reward funds, and fee wallets/percentages are immutable
  constructor args, not owner-settable.
- **ETH platform fee + automated LP reserve**: every buy pays a fixed ETH fee
  (immutable constructor arg). Half accrues for the platform wallet
  (`withdrawPlatformEth`, callable by anyone, pull-payment so a broken wallet
  can never block buys); half accrues in `lpEthReserve`. The reserve is
  released by `releaseLpEth` under a fixed on-chain rule — the entire reserve,
  as soon as it reaches `lpEthReleaseThreshold` OR `lpEthReleaseInterval` has
  elapsed since the last release. Both functions are permissionless because
  the destinations are immutable. The contract intentionally does NOT call a
  DEX router to add the liquidity itself: in-transaction pool adds are
  sandwich/MEV bait and can be primed with flash-loan price manipulation. The
  final add-liquidity step stays a deliberate action from the LP wallet.
