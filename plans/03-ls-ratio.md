# Plan: 03 — SOL Long/Short Ratio (`ls-ratio.ts`)

## Purpose

Fetches the SOL perpetual futures Long/Short account ratio from **Bybit** and **Binance** (both free). This tells us the percentage of accounts that are currently net long vs. net short.

Extreme L/S ratios are a contrarian indicator:
- > 65% long = crowd is heavily positioned long → mean reversion short opportunity
- > 60% short = crowd is heavily positioned short → mean reversion long opportunity

Used in combination with funding rate and z-score for high-conviction entries.

---

## Data Sources

### Bybit (free, no auth)

**Account Long/Short Ratio:**
```
GET https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=SOLUSDT&period=1h&limit=1
```

**Sample response:**
```json
{
  "result": {
    "list": [{
      "symbol": "SOLUSDT",
      "buyRatio": "0.6523",
      "sellRatio": "0.3477",
      "timestamp": "1742000000000"
    }]
  }
}
```

`buyRatio` = fraction of accounts that are net long (0–1)

### Binance Futures (free, no auth)

**Global Long/Short Account Ratio:**
```
GET https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=SOLUSDT&period=1h&limit=1
```

**Sample response:**
```json
[{
  "symbol": "SOLUSDT",
  "longShortRatio": "1.8765",
  "longAccount": "0.6523",
  "shortAccount": "0.3477",
  "timestamp": "1742000000000"
}]
```

> Note: `longShortRatio` = longAccount / shortAccount (ratio > 1 = more longs than shorts)

### Rate limits
- Both APIs: effectively unlimited for our use case (1 call per 15 min max)

---

## Dependencies

```bash
pnpm add axios@^1.13.6 zod@^4.3.6 dotenv@^17.3.1 chalk@^5.6.2 dayjs@^1.11.20
pnpm add -D typescript@^5.9.3 tsx@^4.21.0 @types/node@^25.5.0
```

> ⚠️ Always run `npm show <package> version` before pinning to confirm latest.

No API keys required.

---

## Input / Output

**Input:** None

**Output — TypeScript return type:**
```typescript
interface LSRatioResult {
  bybit: {
    longPct: number;              // e.g. 65.23 (percentage)
    shortPct: number;
    timestamp: Date;
  };
  binance: {
    longPct: number;
    shortPct: number;
    ratio: number;                // longPct / shortPct
    timestamp: Date;
  };
  average: {
    longPct: number;
    shortPct: number;
  };
  signal: 'CROWDED_LONG' | 'CROWDED_SHORT' | 'NEUTRAL';
  emoji: string;
  summary: string;
}
```

**Example summary string:**
```
⚖️ SOL L/S Ratio: 67.2% Long / 32.8% Short (Binance avg) — ⚠️ Crowded LONG
```

---

## Alert Thresholds

| Long % | Signal | Interpretation |
|--------|--------|---------------|
| > 65% | `CROWDED_LONG` | Contrarian short signal |
| 55–65% | `NEUTRAL` | Mild long bias, normal |
| 45–55% | `NEUTRAL` | Balanced |
| 35–45% | `NEUTRAL` | Mild short bias, normal |
| < 35% | `CROWDED_SHORT` | Contrarian long signal |

---

## Module Interface

```typescript
export async function getLSRatio(): Promise<LSRatioResult>
```

Standalone:
```bash
pnpm tsx src/scripts/ls-ratio.ts
```

---

## Error Handling

- Fetch from Bybit and Binance independently
- If one fails, report the other with a note
- If both fail, return `null` — do not crash morning briefing
- Validate all response fields with Zod
- Timeout: 10 seconds

---

## Schedule

- Part of `morning-briefing.ts` (07:30 UTC daily)
- Can be called standalone for real-time checks

---

## Notes

- L/S ratio and funding rate often move together — when both are extreme, signal confidence is higher
- Bybit L/S data is for Bybit accounts only; Binance for Binance accounts — averaging gives a better market-wide picture
- This is an account-count ratio, not a volume/notional ratio — a large whale opening a short doesn't necessarily move the ratio much
- The `period` parameter supports: 5min, 15min, 30min, 1h, 2h, 4h, 6h, 12h, 1d
