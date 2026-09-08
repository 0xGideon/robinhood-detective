# Robinhood Detective

Independent Telegram alert bot for Robinhood Chain DEX activity. This project is not affiliated with Robinhood.

Robinhood Detective runs as a Cloudflare Worker, reads public market data from DexScreener, keeps polling state in Cloudflare KV, and sends alerts to a Telegram channel.

## What It Tracks

The bot discovers Robinhood Chain liquidity pools through an anchor-token registry in `src/index.js`.

The registry currently includes:

- Native ETH (`0x0000000000000000000000000000000000000000`)
- WETH (`0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`)
- USDG / Global Dollar (`0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`)
- The supplied Robinhood stock and ETF tokens, including AAPL, AMZN, AMD, COIN, GOOGL, META, MSFT, NVDA, PLTR, QQQ, SPY, TSLA, and many others

DexScreener requests are made in batches of up to 30 token addresses. Results are restricted to `chainId: robinhood`, deduplicated by pair address, and filtered to pools with at least $5,000 liquidity.

This is anchor-based discovery, not a complete scan of every DexScreener token or every Robinhood Chain contract. A pool is tracked when it is connected to one of the configured anchors, or when its token is newly boosted on DexScreener.

The `WETH/USDG` reference pair is intentionally ignored in both directions. Other pools involving WETH or USDG remain eligible for alerts.

## Alerts

The bot evaluates each discovered pair every polling cycle and can report:

- New pairs
- Newly boosted tokens
- Liquidity spikes and liquidity drains
- Volume surges compared with the trailing polling history
- Large price moves over 5 minutes or 1 hour
- Buy/sell transaction imbalance
- FDV or market-cap milestones
- Severe liquidity collapse or possible rug/dead-pool conditions

Alerts use cooldowns by pair and alert category. A global hourly cap also prevents excessive Telegram traffic.

## Current Thresholds

Important defaults in `src/index.js` include:

| Setting | Value |
| --- | ---: |
| Minimum liquidity to track | $5,000 |
| Maximum alerts per hour | 40 |
| Liquidity change threshold | 0.3% and at least $2,500 |
| Volume surge threshold | 3x trailing average and at least $250 |
| 5-minute price threshold | 25% |
| 1-hour price threshold | 60% |
| Imbalance threshold | 10:1 with at least 10 transactions |
| Poll schedule | Every 3 minutes |

The bot also tracks FDV tiers from $50,000 through $10,000,000 and maintains a short rolling volume history for each pair.

## Architecture

1. `discoverBoosts()` checks DexScreener's latest token-boost endpoint.
2. `fetchAllChainPairs()` queries the configured anchors in batches.
3. Pair state is loaded from the `BOT_STATE` KV namespace.
4. `evaluatePair()` compares current data with the previous snapshot.
5. `dispatchAlerts()` applies cooldowns and the hourly cap before sending Telegram messages.
6. KV stores pair snapshots, known boosts, cooldowns, baseline flags, and the hourly alert counter.

The Worker does not use an RPC endpoint, factory log scanning, or a database outside Cloudflare KV.

## Configuration

`wrangler.toml` contains the Worker name, entry point, KV namespace, cron schedule, and production dry-run setting.

Required Cloudflare bindings and variables:

- `BOT_STATE`: KV namespace binding
- `TELEGRAM_BOT_TOKEN`: secret Telegram bot token
- `TELEGRAM_CHANNEL_ID`: secret target channel ID
- `DRY_RUN`: `true` logs messages without sending them; `false` sends real Telegram messages

The checked-in production configuration uses `DRY_RUN = "false"`.

Set Telegram secrets with Wrangler:

```powershell
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHANNEL_ID
```

Do not commit secrets to this repository.

## Development

Install dependencies:

```powershell
npm install
```

Validate the Worker source:

```powershell
node --check src/index.js
```

Run a local Worker during development:

```powershell
npx wrangler dev
```

Use `DRY_RUN = "true"` when testing alert formatting or configuration changes locally.

## Deployment

Deploy the current Worker with:

```powershell
npx wrangler deploy
```

The production Worker is available at:

`https://robinhood-detective.gideonholmesjn.workers.dev`

The HTTP endpoint only reports that the Worker is alive. Scheduled polling is performed by the Cloudflare cron trigger:

```text
*/3 * * * *
```

Useful operational commands:

```powershell
npx wrangler deployments list
npx wrangler tail robinhood-detective
```

## Updating Anchors

To add another Robinhood Chain stock, ETF, quote asset, or other token:

1. Confirm the exact contract address on Robinhood Chain.
2. Add the address to `ANCHOR_TOKENS` in `src/index.js`.
3. Keep the address in checksum or clearly documented hexadecimal form.
4. Run `node --check src/index.js`.
5. Deploy with `npx wrangler deploy`.

Use contract addresses rather than symbols for identity. Symbols can be duplicated by unrelated tokens.

## Limitations

- DexScreener data can be delayed, incomplete, or rate-limited.
- Anchor discovery does not guarantee full-chain coverage.
- Pools below $5,000 liquidity are not tracked.
- The Worker has a finite Cloudflare subrequest budget per invocation.
- The bot reports market signals; it does not validate projects, recommend trades, or guarantee that an alert represents genuine activity.
- Telegram delivery depends on the configured bot token, channel ID, and Telegram availability.

## Disclaimer

Robinhood Detective is an independent monitoring tool. Alerts are informational only. Always verify token contracts, liquidity, ownership, and trading conditions yourself before taking action.
