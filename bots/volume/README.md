# Volume + burn telemetry bot

Read-only. No wallet, no private key, no signing. Derives swap volume from
Uniswap V3 fee-growth accumulators on the BUFFCAT/WETH pool and posts to
Telegram.

    volume = (deltaFeeGrowth * liquidity / 2^128) * 1e6 / fee

Pool 0xde543192e1939Ee2538db77CCc225Aa67412bEa6, fee tier 1%, token0 = WETH,
so feeGrowthGlobal0 = buys and feeGrowthGlobal1 = sells.

Commands:
- /vol   volume since last snapshot
- /burn  supply / burnt / burnt value card (also auto-posts hourly)
- /tg    owner-only; two-step, sets the target chat for the burn card

Deploy: copy .env.example to .env, fill it in, install buffcat-volume.service.

NEVER add a signing key to this process. If burn triggers are wanted later,
the bot notifies and a human signs.
