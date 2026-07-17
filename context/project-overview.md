# BuffCat Miner

## Overview

BuffCat Miner is an onchain "miner" / staking dApp on Robinhood Chain
(Arbitrum-Orbit L2, chain 4663; testnet 46630). Users lock the BUFFCAT
ERC-20 into time-based positions ("miners") and earn dividends paid in
ETH, USDG, or a weekly "featured" token (e.g. a Robinhood Stock Token
such as NVDA). Longer lock tiers grant a larger hashpower multiplier and
therefore a larger share of the dividend stream. It is a smart contract
(Foundry/Solidity) plus a static vanilla-JS frontend.

## Goals

1. Let a user lock BUFFCAT and receive a dividend-earning position whose
   principal is returned in full at unlock.
2. Pay dividends in the user's chosen asset (ETH / USDG / featured token)
   proportional to their share of total hashpower, via an O(1) accumulator.
3. Run weekly "featured" campaigns (snapshot-gated so front-runners earn
   zero) funded by a project-supplied pot.
4. Ship only after the full 7-step safety ritual (see ai-workflow-rules.md)
   — never hold real funds before an independent human audit.

## Core User Flow

1. User connects an EVM wallet on Robinhood Chain.
2. User approves BUFFCAT and calls `lock(amount, tier, choice)`, paying a
   flat ETH fee (buyFeeWei). 100% of the BUFFCAT locked is principal.
3. The position accrues dividends in the chosen asset after MIN_HOLD (24h).
4. User calls `claim(posId)` to collect dividends (free), and/or `compound`
   to reinvest.
5. At maturity, user calls `unlock(posId)` to get 100% of principal back
   (early unlock costs a 10% penalty split 70/15/15).

## Features

### Locking & positions
- 7 lock tiers (1 day → 100 years), hashpower multiplier 1.0×–6.0×.
- Multiple independent positions per wallet; each has its own asset choice.
- Flat ETH lock fee (buyFeeWei, owner-adjustable within 0.0005–0.05 ETH),
  split 25% buyback / 40% dividends / 15% platform / 20% eco.

### Dividends
- Paid in ETH / USDG / featured token per the position's `choice`.
- O(1) scaled-accumulator (MasterChef-style) accounting.
- Featured-token campaigns are snapshot-gated (front-run resistant) with a
  1.3× featured bonus; rotated weekly via owner `setFeatured`.

### Frontend
- Static site (index.html + mining.html) + vanilla JS, ethers 5.7.2 UMD.
- Wallet connect, lock form with live fee/hashpower breakdown, per-position
  cards with claim/unlock.

## Scope

### In Scope
- The BuffCatMiner contract + its Foundry test suite.
- The mining frontend (mining.html/js/css) wired to the contract ABI.
- Testnet deploy + Blockscout verify + manual end-to-end testing.

### Out of Scope (for now)
- ETH/USDG/featured **choice selector** UI on the buy form (locks default
  to ETH / choice 0 until built).
- On-chain price oracle (design deliberately avoids one; flat ETH fee).
- Featured **claim (out-direction)** with a real Stock Token — not yet
  proven on testnet (see progress-tracker).
- Mainnet deploy — blocked until Steps 5 & 6 complete.

## Success Criteria

1. `forge test` passes 20/20 including the 128k-call invariant fuzz.
2. Slither shows 0 unresolved High/Medium findings.
3. Deployed + verified on Robinhood Chain testnet; every button (lock,
   claim, compound, unlock, early-exit, setFeatured, fundFeatured, pause)
   exercised by hand with expected results.
4. A Stock Token can move **into and out of** the contract on testnet.
5. Independent human audit passed before any mainnet deploy.
