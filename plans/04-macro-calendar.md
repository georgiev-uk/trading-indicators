# Plan: 04 — Macro Economic Calendar (`macro-calendar.ts`)

## Purpose

Fetches today's high-impact macroeconomic events from the ForexFactory calendar. High-impact events (FOMC, CPI, NFP, GDP, PPI, JOLTS, etc.) cause extreme volatility and can invalidate technical signals like our z-score.

The rule: **if a high-impact event is scheduled today, reduce position sizes or avoid trading in the 30 minutes before and after the event**.

---

## Data Source

**ForexFactory Unofficial JSON Feed (free, no auth):**
```
GET https://nfs.faireconomy.media/ff_calendar_thisweek.json
```

This is a community-maintained endpoint that mirrors ForexFactory's weekly calendar in JSON format. It's widely used in the algo-trading community and is reliably available.

**Sample response:**
```json
[
  {
    "title": "FOMC Statement",
    "country": "USD",
    "date": "2026-03-18T18:00:00-0500",
    "impact": "High",
    "forecast": "5.25%",
    "previous": "5.25%"
  },
  {
    "title": "CPI m/m",
    "country": "USD",
    "date": "2026-03-15T08:30:00-0500",
    "impact": "High",
    "forecast": "0.3%",
    "previous": "0.4%"
  }
]
```

**Impact levels:** `"High"` | `"Medium"` | `"Low"` | `"Non-Economic"`

**Fallback option if the above endpoint is unavailable:**
- Investing.com scrape (less reliable, requires user-agent spoofing)
- Manual override via `.env` file (see below)

---

## Dependencies

```bash
pnpm add axios@^1.13.6 zod@^4.3.6 dotenv@^17.3.1 chalk@^5.6.2 dayjs@^1.11.20
pnpm add -D typescript@^5.9.3 tsx@^4.21.0 @types/node@^25.5.0
```

> ⚠️ Always run `npm show <package> version` before pinning to confirm latest.

No API keys required for ForexFactory feed.

---

## Input / Output

**Input (env vars — all optional):**
```
TIMEZONE=Europe/London       # Default: UTC. Used for displaying event times in local time
```

**Output — TypeScript return type:**
```typescript
interface MacroEvent {
  title: string;              // e.g. "FOMC Statement"
  country: string;            // e.g. "USD"
  datetime: Date;
  datetimeLocal: string;      // Formatted in configured timezone, e.g. "18:00 GMT"
  impact: 'High' | 'Medium' | 'Low' | 'Non-Economic';
  forecast: string;
  previous: string;
  minutesUntil: number;       // Negative if already passed today
}

interface MacroCalendarResult {
  today: MacroEvent[];        // All events today
  highImpact: MacroEvent[];   // Filtered to High impact only
  hasHighImpactToday: boolean;
  nextHighImpact: MacroEvent | null;  // Next upcoming high-impact event
  signal: 'CAUTION' | 'CLEAR';
  summary: string;            // Human-readable for WhatsApp
}
```

**Example summary strings:**

With events:
```
📅 Macro Today: ⚠️ HIGH IMPACT — CPI m/m @ 13:30 GMT, FOMC @ 19:00 GMT
   → Reduce size around these windows
```

Clear day:
```
📅 Macro Today: ✅ No high-impact events — clear to trade normally
```

---

## Filtering Logic

```typescript
const today = dayjs().format('YYYY-MM-DD');

// Filter to today's events in the weekly feed
const todayEvents = allEvents.filter(e =>
  dayjs(e.date).format('YYYY-MM-DD') === today
);

// High-impact USD events only (we care about USD macro for crypto)
const highImpact = todayEvents.filter(e =>
  e.impact === 'High' && e.country === 'USD'
);
```

We filter for **USD events only** as these are the ones that move crypto markets. Other currencies (EUR, GBP, JPY) can be optionally included.

---

## Alert Thresholds

| Condition | Signal | Action |
|-----------|--------|--------|
| 1+ high-impact USD event today | `CAUTION` | Note event times, reduce size near window |
| No high-impact events | `CLEAR` | Trade normally |

---

## Module Interface

```typescript
export async function getMacroCalendar(): Promise<MacroCalendarResult>
```

Standalone:
```bash
pnpm tsx src/scripts/macro-calendar.ts
```

---

## Error Handling

- On failure to fetch from ForexFactory feed: return `{ signal: 'CLEAR', summary: '⚠️ Calendar unavailable — check manually', ... }`
- Do NOT mark as CAUTION on fetch failure (better to trade and be wrong than to block on missing data)
- Validate response array with Zod (loose schema — ignore unknown fields)
- Timeout: 10 seconds

---

## Schedule

- Part of `morning-briefing.ts` (07:30 UTC daily)
- The weekly feed is fetched once and filtered to today's date — no need for intraday polling

---

## Notes

- ForexFactory times are in US Eastern Time (EST/EDT) — dayjs timezone conversion handles this
- The `nfs.faireconomy.media` endpoint updates throughout the week as forecasts are revised
- Key events to watch for crypto: FOMC, CPI, PPI, NFP, GDP, JOLTS, Core PCE
- In 2025–2026 context: Fed rate decisions have outsized effect on risk assets including crypto
