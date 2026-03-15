# Plan: 05 — BTC Dominance (`btc-dominance.ts`)

## Purpose

Tracks Bitcoin's market cap dominance (BTC.D) via the CoinGecko free API. BTC dominance is a key macro filter for altcoin trading:

- **Rising BTC.D** = capital flowing into BTC, out of alts → **risk-off** for SOL longs
- **Falling BTC.D** = capital rotating into alts → **risk-on** for SOL longs
- **Rapid rise in BTC.D** (> +1.5% in 24h) = potential altcoin sell-off incoming

This is the same "intermarket analysis" concept covered in our trading books (Katsanos / Intermarket Trading Strategies): when the dominant asset is strengthening, subordinate assets often lag or decline.

---

## Data Source

**CoinGecko Global Data (free, no auth):**
```
GET https://api.coingecko.com/api/v3/global
```

Returns global market data including BTC and ETH dominance, total market cap, 24h volume.

**Sample response:**
```json
{
  "data": {
    "active_cryptocurrencies": 16500,
    "total_market_cap": {
      "btc": 19500000,
      "usd": 2450000000000
    },
    "total_volume": {
      "usd": 98000000000
    },
    "market_cap_percentage": {
      "btc": 56.42,
      "eth": 13.21,
      "sol": 3.87,
      "usdt": 4.12
    },
    "market_cap_change_percentage_24h_usd": -1.23
  }
}
```

**CoinGecko SOL Price (for context, free):**
```
GET https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true
```

### Rate limits (free tier)
- 30 calls/minute on demo (free) tier
- Our scripts call this once per morning — well within limits
- No API key needed for public endpoints

---

## Dependencies

```bash
pnpm add axios@^1.13.6 zod@^4.3.6 dotenv@^17.3.1 chalk@^5.6.2 dayjs@^1.11.20
pnpm add -D typescript@^5.9.3 tsx@^4.21.0 @types/node@^25.5.0
```

> ⚠️ Always run `npm show <package> version` before pinning to confirm latest.

---

## Input / Output

**Input:** None (no env vars required for basic usage)

**Output — TypeScript return type:**
```typescript
interface BTCDominanceResult {
  btcDominance: number;             // e.g. 56.42 (percent)
  ethDominance: number;
  solDominance: number;
  totalMarketCapUsd: number;
  totalMarketCap24hChangePct: number;
  solPriceUsd: number;
  sol24hChangePct: number;
  // Trend requires storing yesterday's value — see Notes
  btcDominance24hChange: number | null;   // null if no cached value
  signal: 'RISK_OFF' | 'RISK_ON' | 'NEUTRAL';
  emoji: string;
  summary: string;
}
```

**Example summary strings:**
```
📊 BTC.D: 58.4% (+1.8% 24h) ⚠️ RISK OFF — BTC dominance rising, alts under pressure
```
```
📊 BTC.D: 54.1% (-0.9% 24h) ✅ RISK ON — Capital rotating to alts
```

---

## 24h Change Tracking

CoinGecko's `/global` endpoint does NOT return the previous day's BTC.D, only the current value. To compute the 24h change we need one of:

1. **Local state file** — store yesterday's value in `data/btc-dominance-cache.json`. On each run, read cache → compute change → write new value to cache.
2. **CoinGecko Historical** (paid tier) — not needed if we use option 1.

**Recommended approach: local cache file**

```typescript
// data/btc-dominance-cache.json
{
  "btcDominance": 56.42,
  "fetchedAt": "2026-03-14T07:30:00Z"
}
```

The cache is read at start, compared to current value, then updated. If cache is < 20 hours old, skip the fetch and report cached value.

---

## Alert Thresholds

| 24h BTC.D Change | Signal | Interpretation |
|-----------------|--------|---------------|
| > +1.5% | `RISK_OFF` | Strong dominance rise — alts at risk |
| +0.5% to +1.5% | `NEUTRAL` | Mild rotation to BTC |
| -0.5% to +0.5% | `NEUTRAL` | Stable |
| -0.5% to -1.5% | `NEUTRAL` | Mild rotation to alts |
| < -1.5% | `RISK_ON` | Strong altcoin rotation — favours SOL longs |

Absolute level also matters as context:
- BTC.D > 60%: historical "alt season is over" territory
- BTC.D < 45%: peak alt season territory

---

## Module Interface

```typescript
export async function getBTCDominance(): Promise<BTCDominanceResult>
```

Standalone:
```bash
pnpm tsx src/scripts/btc-dominance.ts
```

---

## Error Handling

- On CoinGecko API failure (rate limit, outage): return `null` with warning
- Handle `null` gracefully in morning briefing (just omit this section)
- Validate full response shape with Zod
- Timeout: 10 seconds
- Note: CoinGecko free tier occasionally returns 429 (rate limit). Add 1-retry with 5s backoff.

---

## Schedule

- Part of `morning-briefing.ts` (07:30 UTC daily)
- Cache file updated on each run → 24h delta computed automatically

---

## Notes

- SOL dominance is also interesting to track — rising SOL.D = Solana specifically gaining favour
- The total market cap 24h change gives a broader market context (is the whole market up or down?)
- CoinGecko free tier is suitable for our daily cadence, but if we move to more frequent polling (e.g. hourly) we should apply for a free CoinGecko API key to get higher limits
