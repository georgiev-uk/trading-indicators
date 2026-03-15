# Plan: 01 — Fear & Greed Index (`fear-greed.ts`)

## Purpose

Fetches the Crypto Fear & Greed Index from Alternative.me. Used as a macro sentiment filter:
- **Extreme Fear (< 25):** Market is oversold / panicking — avoid new shorts, favour long reversals
- **Extreme Greed (> 75):** Market is overbought / euphoric — avoid new longs, favour short reversals
- **Neutral zone (25–75):** Normal — trade z-score signals as-is

This is one of the cheapest and most reliable macro filters available. The API is completely free with no authentication required.

---

## Data Source

**API:** `https://api.alternative.me/fng/?limit=7`

- No API key required
- Returns last 7 days of daily values (used for trend)
- Response includes: `value` (0–100), `value_classification` (e.g. "Extreme Fear"), `timestamp`
- Rate limit: generous, no known hard cap on free tier

**Sample response:**
```json
{
  "name": "Fear and Greed Index",
  "data": [
    {
      "value": "42",
      "value_classification": "Fear",
      "timestamp": "1742000000",
      "time_until_update": "54321"
    }
  ]
}
```

---

## Dependencies

Check npm for latest versions before installing. As of 2026-03-15:

```bash
pnpm add axios@^1.13.6 zod@^4.3.6 dotenv@^17.3.1 chalk@^5.6.2 dayjs@^1.11.20
pnpm add -D typescript@^5.9.3 tsx@^4.21.0 @types/node@^25.5.0
```

> ⚠️ Always run `npm show <package> version` before pinning to confirm you have the latest.

---

## Input / Output

**Input:** None (no env vars required for this script)

**Output — TypeScript return type:**
```typescript
interface FearGreedResult {
  current: {
    value: number;                // 0–100
    classification: string;       // e.g. "Extreme Fear"
    timestamp: Date;
  };
  trend: Array<{
    value: number;
    classification: string;
    date: string;                 // "YYYY-MM-DD"
  }>;
  signal: 'AVOID_LONGS' | 'AVOID_SHORTS' | 'NEUTRAL';
  emoji: string;                  // 😨 / 🤑 / 😐
  summary: string;                // Human-readable one-liner for WhatsApp
}
```

**Example summary string:**
```
😨 Fear & Greed: 18 (Extreme Fear) ↘️ — Favour shorts, avoid new longs
```

---

## Alert Thresholds

| Value | Classification | Signal | Action |
|-------|---------------|--------|--------|
| 0–24 | Extreme Fear | `AVOID_SHORTS` | Market oversold — mean reversion favours longs |
| 25–44 | Fear | `NEUTRAL` | Trade normally |
| 45–55 | Neutral | `NEUTRAL` | Trade normally |
| 56–75 | Greed | `NEUTRAL` | Trade normally |
| 76–100 | Extreme Greed | `AVOID_LONGS` | Market overbought — mean reversion favours shorts |

---

## Module Interface

The script exports a single async function (used by `morning-briefing.ts`):

```typescript
export async function getFearGreed(): Promise<FearGreedResult>
```

It can also be run standalone:
```bash
pnpm tsx src/scripts/fear-greed.ts
```

Standalone output: prints a formatted summary to stdout.

---

## Error Handling

- Wrap all API calls in try/catch
- On network failure: return `null` and log a warning — do not crash the morning briefing
- Validate response shape with Zod schema before using data
- Timeout: 10 seconds (axios `timeout` option)

---

## Schedule

- Used by `morning-briefing.ts` (runs at 07:30 UTC daily)
- Can also be triggered standalone on-demand

---

## Notes

- The F&G index updates once per day (around 00:00 UTC)
- The 7-day trend is useful to see if sentiment is deteriorating or recovering
- This is the same index tracked on Coinglass (for reference)
