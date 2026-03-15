# trading-indicators

TypeScript scripts to monitor key crypto trading indicators for the SOL mean-reversion strategy.

## Stack

- **Language:** TypeScript (strict mode)
- **Runtime:** Node.js with `tsx` for direct TS execution
- **Package manager:** `pnpm`

## Scripts

| # | Script | Data Source | Purpose |
|---|--------|-------------|---------|
| 01 | `fear-greed.ts` | Alternative.me | Crypto Fear & Greed Index — macro sentiment filter |
| 02 | `funding-rate.ts` | Binance + Bybit (free) | SOL perpetual funding rate — crowd bias signal |
| 03 | `ls-ratio.ts` | Bybit (free) | SOL Long/Short ratio — extreme positioning alert |
| 04 | `macro-calendar.ts` | ForexFactory (unofficial JSON) | High-impact macro events for the day |
| 05 | `btc-dominance.ts` | CoinGecko (free) | BTC dominance trend — risk-on/off macro filter |
| 06 | `sol-tvl.ts` | DefiLlama (free) | Solana ecosystem TVL health |
| 07 | `morning-briefing.ts` | All of the above | Daily combined WhatsApp briefing |
| 08 | `lunarcrush.ts` | LunarCrush MCP *(paid)* | Social sentiment + Galaxy Score for SOL |

## Plans

All implementation plans are in the [`plans/`](./plans) directory. Review and approve before implementation.

## Setup (after plans approved)

```bash
pnpm install
cp .env.example .env
# Fill in any required API keys in .env
pnpm run morning-briefing
```

## Package Versions

All packages pinned to latest as of 2026-03-15:

| Package | Version | Purpose |
|---------|---------|---------|
| typescript | ^5.9.3 | TypeScript compiler |
| tsx | ^4.21.0 | Run TS files directly |
| @types/node | ^25.5.0 | Node.js type definitions |
| axios | ^1.13.6 | HTTP client |
| zod | ^4.3.6 | Runtime schema validation |
| dotenv | ^17.3.1 | Environment variable loading |
| chalk | ^5.6.2 | Terminal output colouring |
| dayjs | ^1.11.20 | Date/time utilities |
| node-cron | ^4.2.1 | Cron scheduling (if running as daemon) |
