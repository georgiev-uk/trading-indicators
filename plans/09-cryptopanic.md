# Plan: 09 — CryptoPanic News Sentiment (`cryptopanic.ts`)

## Purpose

Fetches recent crypto news headlines from CryptoPanic filtered to Bitcoin and Solana, and computes a news sentiment signal based on the ratio of bullish vs bearish votes.

Used as a news-driven sentiment overlay in the morning briefing:
- **BEARISH:** More fear/bearish stories dominating → caution, favour shorts
- **BULLISH:** Positive news momentum → possible long bias
- **NEUTRAL:** Mixed or quiet news day → trade normally

This complements the Fear & Greed index (which is slow-moving) with faster-moving news sentiment.

---

## Data Source

**API:** `https://cryptopanic.com/api/free/v2/posts/`

- Requires `CRYPTOPANIC_API_KEY` env var (free account at cryptopanic.com)
- Filter to `currencies=BTC,SOL` and `kind=news`
- Use `filter=rising` to get the most-voted recent stories
- Returns up to 20 posts per request (free tier default)

**Key query parameters:**
- `auth_token` — API key from env
- `currencies` — `BTC,SOL`
- `kind` — `news` (excludes Reddit/media noise)
- `filter` — `rising` (most engaged stories in last 24h)
- `public` — `true`

**Sample response:**
```json
{
  "count": 20,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": 12345,
      "title": "Solana TVL reaches new high amid DeFi surge",
      "published_at": "2026-03-16T06:00:00Z",
      "url": "https://...",
      "source": { "title": "CoinDesk", "domain": "coindesk.com" },
      "currencies": [{ "code": "SOL", "title": "Solana" }],
      "votes": {
        "negative": 2,
        "positive": 18,
        "important": 12,
        "liked": 15,
        "disliked": 3,
        "lol": 0,
        "toxic": 1,
        "saved": 4,
        "comments": 5
      },
      "kind": "news"
    }
  ]
}
```

---

## Dependencies

All already installed in the project. No new packages required.

```bash
# Verify already present:
# axios, zod, dayjs, dotenv, chalk
```

> ⚠️ Always run `npm show <package> version` before adding any new dependency.

---

## Input / Output

**Input (env vars):**
```
CRYPTOPANIC_API_KEY=your_token_here
```

**Output — TypeScript return type:**
```typescript
interface CryptoPanicResult {
  totalPosts: number;
  bullishCount: number;        // posts with positive votes > negative
  bearishCount: number;        // posts with negative votes > positive
  neutralCount: number;
  bullishRatio: number;        // 0–1, bullishCount / totalPosts
  topHeadlines: string[];      // top 3 headlines by vote count
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  summary: string;             // one-liner for WhatsApp
}
```

**Example summary strings:**
```
📰 News Sentiment: 14/20 bullish — Positive momentum, slight long bias
📰 News Sentiment: 15/20 bearish — Negative news flow, favour caution
📰 News Sentiment: Mixed (10/10) — No strong directional bias
```

---

## Signal Logic

Compute `bullishRatio = bullishCount / totalPosts` based on individual post sentiment (positive votes > negative votes → bullish post):

| Condition | Signal | Meaning |
|-----------|--------|---------|
| bullishRatio > 0.65 | `BULLISH` | Strong positive news flow |
| bullishRatio < 0.35 | `BEARISH` | Negative news dominating |
| otherwise | `NEUTRAL` | Mixed/quiet news |

Strict inequalities (`>` and `<`, not `>=` and `<=`).

If API key is missing or API fails → return `null` (never throw).

---

## Module Interface

```typescript
export async function getCryptoPanic(): Promise<CryptoPanicResult | null>
```

Standalone:
```bash
pnpm tsx src/scripts/cryptopanic.ts
```

---

## Error Handling

- If `CRYPTOPANIC_API_KEY` is not set: log warning, return `null`
- Wrap all API calls in try/catch — return `null` on any failure
- Validate response with Zod schema (use `.passthrough()` on nested objects)
- Timeout: 10 seconds (axios `timeout` option)
- On 429 rate limit: return `null` with warning (no retry — free tier is generous enough)

---

## Integration with Morning Briefing

Add to `morning-briefing.ts`:
```typescript
import { getCryptoPanic } from './cryptopanic.js';
```

- Signal `BULLISH` → counts as a **long signal** in `computeStance`
- Signal `BEARISH` → counts as a **short signal** in `computeStance`
- Add a `📰 *News:*` section to the briefing message

Update `computeStance` Signal type to include `'BULLISH'` and `'BEARISH'`.

---

## Schedule

- Run as part of `morning-briefing.ts` (07:30 UTC and 13:00 UTC)
- Can also be run standalone on-demand

---

## Notes

- Free tier has no hard rate limit for reasonable usage (2× daily is well within limits)
- `filter=rising` gives stories that have gained community traction — more signal than raw chronological feed
- Only `kind=news` is used (not Reddit/media) for higher quality sources
- The free API endpoint is `v2/free/` — do not use the pro endpoint
