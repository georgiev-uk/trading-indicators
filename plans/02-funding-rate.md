# Plan: 02 — SOL Funding Rate (`funding-rate.ts`)

## Purpose

Fetches the current SOL perpetual futures funding rate from **Binance** and **Bybit** (both free, no auth required). High positive funding = market is crowded long → mean reversion short signal. Negative funding = market is crowded short → mean reversion long signal.

> **Note:** Coinglass was originally considered but requires a paid API subscription for reasonable rate limits. Binance and Bybit both provide funding rate data for free.

Funding rate is one of the most direct signals for our z-score mean reversion strategy:
- When funding is very positive, longs are paying shorts — market is over-extended long
- When z-score is also high (> 1.5) AND funding is positive → high-conviction short
- When z-score is low (< -1.5) AND funding is negative → high-conviction long

---

## Data Sources

### Binance Futures (free, no auth)

**Latest funding rate:**
```
GET https://fapi.binance.com/fapi/v1/fundingRate?symbol=SOLUSDT&limit=1
```

**Next funding time + predicted rate:**
```
GET https://fapi.binance.com/fapi/v1/premiumIndex?symbol=SOLUSDT
```

**Sample response (fundingRate):**
```json
[{
  "symbol": "SOLUSDT",
  "fundingRate": "0.00010000",
  "fundingTime": 1742000000000,
  "markPrice": "120.50"
}]
```

### Bybit (free, no auth)

**Latest funding rate:**
```
GET https://api.bybit.com/v5/market/funding/history?category=linear&symbol=SOLUSDT&limit=1
```

**Current funding + predicted:**
```
GET https://api.bybit.com/v5/market/tickers?category=linear&symbol=SOLUSDT
```

**Sample response (tickers):**
```json
{
  "result": {
    "list": [{
      "symbol": "SOLUSDT",
      "fundingRate": "0.0001",
      "nextFundingTime": "1742000000000",
      "lastPrice": "120.45"
    }]
  }
}
```

### Rate limits
- Binance: 2400 weight/minute (this request = 1 weight) — effectively unlimited for our use
- Bybit: 120 requests/second — no issue

---

## Dependencies

```bash
pnpm add axios@^1.13.6 zod@^4.3.6 dotenv@^17.3.1 chalk@^5.6.2 dayjs@^1.11.20
pnpm add -D typescript@^5.9.3 tsx@^4.21.0 @types/node@^25.5.0
```

> ⚠️ Always run `npm show <package> version` before pinning to confirm latest.

No API keys required for either source.

---

## Input / Output

**Input:** None (no env vars required)

**Output — TypeScript return type:**
```typescript
interface FundingRateResult {
  solPrice: number;
  binance: {
    currentRate: number;           // e.g. 0.0001 = 0.01%
    annualised: number;            // rate * 3 * 365 (3 settlements/day)
    nextSettlement: Date;
    predictedRate: number;
  };
  bybit: {
    currentRate: number;
    annualised: number;
    nextSettlement: Date;
    predictedRate: number;
  };
  average: {
    currentRate: number;
    annualised: number;
  };
  signal: 'CROWDED_LONG' | 'CROWDED_SHORT' | 'NEUTRAL';
  emoji: string;
  summary: string;                 // Human-readable one-liner for WhatsApp
}
```

**Example summary string:**
```
📈 SOL Funding: +0.032%/8h (ann. +43.8%) — Crowded LONG ⚠️ — Favours short entries
```

---

## Alert Thresholds

Funding rate is per-8-hour settlement. Annualised = rate × 3 × 365.

| 8h Rate | Annualised | Signal | Interpretation |
|---------|-----------|--------|---------------|
| > +0.05% | > +68% | `CROWDED_LONG` | Market heavily long — watch for short mean reversion |
| +0.01% to +0.05% | +14% to +68% | `NEUTRAL` | Mild long bias, normal |
| -0.01% to +0.01% | -14% to +14% | `NEUTRAL` | Balanced |
| -0.01% to -0.03% | -14% to -41% | `NEUTRAL` | Mild short bias, normal |
| < -0.03% | < -41% | `CROWDED_SHORT` | Market heavily short — watch for long mean reversion |

---

## Annualisation Formula

```typescript
const annualised = currentRate * 3 * 365; // 3 settlements per day × 365 days
```

This converts the per-8h rate to a yearly percentage — easier to reason about. E.g. 0.01%/8h = 10.95% APR paid by longs to shorts.

---

## Module Interface

```typescript
export async function getFundingRate(): Promise<FundingRateResult>
```

Standalone:
```bash
pnpm tsx src/scripts/funding-rate.ts
```

---

## Error Handling

- Fetch from both Binance and Bybit independently
- If one fails, use the other and note it in the summary
- If both fail, return `null` — do not crash morning briefing
- Validate response with Zod schemas
- Timeout: 10 seconds per request

---

## Schedule

- Part of `morning-briefing.ts` (07:30 UTC daily)
- Can also be run standalone for real-time checks

---

## Notes

- SOL funding on Binance and Bybit are typically very close; averaging gives a cleaner signal
- Funding settles every 8 hours: 00:00, 08:00, 16:00 UTC
- Extreme positive funding (> 0.1%/8h) has historically preceded sharp reversals in SOL
- Cross-reference with z-score: both at extremes = high-conviction trade
