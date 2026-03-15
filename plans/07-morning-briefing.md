# Plan: 07 — Morning Briefing (`morning-briefing.ts`)

## Purpose

Orchestrates all indicator scripts (01–06, plus 08 if LunarCrush is configured) and compiles a single, consolidated WhatsApp message sent every morning at **07:30 UTC (08:30 London time)**.

The briefing gives a complete pre-trading picture in 30 seconds: macro environment, crowd positioning, SOL ecosystem health, and any alerts that modify the default strategy.

---

## Design

- Runs all scripts **in parallel** using `Promise.allSettled` — one failing script never blocks the others
- Each script returns a standardised `summary: string` that is composed into the message
- Scripts that return `null` (error) are omitted from the briefing with a fallback note
- The overall `signal` from each script is aggregated into a top-level **Trading Stance**

---

## Dependencies

```bash
pnpm add axios@^1.13.6 zod@^4.3.6 dotenv@^17.3.1 chalk@^5.6.2 dayjs@^1.11.20
pnpm add -D typescript@^5.9.3 tsx@^4.21.0 @types/node@^25.5.0
```

> ⚠️ Always run `npm show <package> version` before pinning to confirm latest.

No additional packages beyond those used by individual scripts.

---

## Input / Output

**Input (env vars):**
```
TIMEZONE=Europe/London         # For displaying local times in macro calendar
LUNARCRUSH_API_KEY=            # Optional — only needed for script 08
```

**Output:** A WhatsApp message sent via `mcp__nanoclaw__send_message`, plus stdout for debugging.

---

## Message Format

```
🌅 *Morning Briefing — Mon 15 Mar 2026*

😐 *Sentiment:* 42 (Fear) ↘️ — Neutral zone, trade normally

📈 *SOL Funding:* +0.012%/8h (ann. +16.4%) — Mild long bias, normal

⚖️ *L/S Ratio:* 58.3% Long — Neutral

📅 *Macro:* ⚠️ CPI @ 13:30 GMT — Reduce size before announcement

📊 *BTC.D:* 56.4% (+0.3% 24h) — Stable

🏗️ *Solana TVL:* $8.42B (+1.2% 24h) — Healthy

---
🎯 *Trading Stance: NEUTRAL*
No strong signals today. Trade z-score entries as normal.
Use standard 1–2% position sizing.
```

**When multiple signals align (example — high-conviction SHORT day):**
```
🌅 *Morning Briefing — Tue 18 Mar 2026*

🤑 *Sentiment:* 81 (Extreme Greed) ↗️ — ⚠️ AVOID LONGS

📈 *SOL Funding:* +0.071%/8h (ann. +97%) — ⚠️ CROWDED LONG

⚖️ *L/S Ratio:* 72.1% Long — ⚠️ CROWDED LONG

📅 *Macro:* ✅ No high-impact events today

📊 *BTC.D:* 54.8% (-2.1% 24h) — Slight altcoin rotation

🏗️ *Solana TVL:* $7.9B (-0.5% 24h) — Stable

---
🎯 *Trading Stance: FAVOUR SHORTS*
3/3 sentiment signals aligned → high-conviction short setup.
Wait for z-score > 1.5 entry. Size up to 150% of normal.
```

---

## Trading Stance Logic

```typescript
type Signal = 'AVOID_LONGS' | 'AVOID_SHORTS' | 'CROWDED_LONG' | 'CROWDED_SHORT' |
              'RISK_OFF' | 'RISK_ON' | 'CAUTION' | 'NEUTRAL' | 'HEALTHY' | 'CLEAR'

function computeStance(signals: Signal[]): { stance: string; note: string } {
  const shortSignals = signals.filter(s =>
    s === 'AVOID_LONGS' || s === 'CROWDED_LONG'
  ).length;

  const longSignals = signals.filter(s =>
    s === 'AVOID_SHORTS' || s === 'CROWDED_SHORT' || s === 'RISK_ON'
  ).length;

  const cautionSignals = signals.filter(s =>
    s === 'CAUTION' || s === 'RISK_OFF'
  ).length;

  if (shortSignals >= 2) return { stance: 'FAVOUR SHORTS', note: `${shortSignals}/3 signals aligned short` };
  if (longSignals >= 2)  return { stance: 'FAVOUR LONGS',  note: `${longSignals}/3 signals aligned long` };
  if (cautionSignals >= 1) return { stance: 'CAUTION',     note: 'Risk-off signal active — reduce size' };
  return { stance: 'NEUTRAL', note: 'Trade z-score entries as normal' };
}
```

---

## Module Interface

The morning briefing is run as the main entry point:

```bash
pnpm tsx src/scripts/morning-briefing.ts
```

It is also the script called by the Nanoclaw scheduled task.

**Internal imports:**
```typescript
import { getFearGreed }      from './fear-greed.js';
import { getFundingRate }    from './funding-rate.js';
import { getLSRatio }        from './ls-ratio.js';
import { getMacroCalendar }  from './macro-calendar.js';
import { getBTCDominance }   from './btc-dominance.js';
import { getSolTVL }         from './sol-tvl.js';
// import { getLunarCrush }  from './lunarcrush.js'; // optional
```

Note: TypeScript with `"moduleResolution": "NodeNext"` requires `.js` extensions even for `.ts` source files.

---

## Scheduled Task

This script will be registered as a Nanoclaw scheduled task (cron: `30 7 * * *` UTC = 07:30 daily).

**Task prompt pattern:**
```
Run: pnpm --prefix /path/to/trading-indicators tsx src/scripts/morning-briefing.ts
```

Or, once the repo is set up on a server, it runs as a standalone Node.js cron job.

---

## Error Handling

- Use `Promise.allSettled` — all scripts run in parallel, failures are isolated
- Each settled result is checked: `status === 'rejected'` → use fallback message for that section
- If ALL scripts fail: send a minimal message `"⚠️ Morning briefing failed — all data sources unavailable"`
- Log all errors to stdout for debugging

---

## Schedule

- Primary: 07:30 UTC daily (08:30 London / 09:30 CET)
- The schedule targets the opening of the European trading session
- Can also be triggered manually on-demand

---

## Notes

- The message format uses WhatsApp markdown: `*bold*`, `_italic_`
- Keep the message scannable — Marto should be able to read it in < 30 seconds
- In future: could add a `🔴 ALERT` mode for intraday signals (funding rate spikes, TVL crashes)
