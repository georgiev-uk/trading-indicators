# Plan: 08 — LunarCrush Social Sentiment (`lunarcrush.ts`)

## Purpose

Fetches social sentiment data for SOL (and BTC as context) from LunarCrush. Provides:
- **Galaxy Score™** — overall coin health (0–100, combining social + market data)
- **AltRank™** — relative performance vs all other altcoins
- **Social Volume** — number of social media posts mentioning SOL
- **Social Sentiment** — bullish vs bearish ratio in social posts

This is the "narrative economics" layer from Shiller's Irrational Exuberance — when social sentiment becomes extreme, price reversals often follow.

> ⚠️ **Paid subscription required.** LunarCrush MCP requires an active paid plan. This script is **optional** and disabled by default. Enable by setting `LUNARCRUSH_API_KEY` in `.env`.

---

## Data Source

### Option A: LunarCrush REST API (paid)

**SOL coin data:**
```
GET https://lunarcrush.com/api4/public/coins/sol/v1
Authorization: Bearer YOUR_API_KEY
```

**Sample response:**
```json
{
  "data": {
    "id": 5426,
    "symbol": "SOL",
    "name": "Solana",
    "price": 120.45,
    "price_btc": 0.001234,
    "volume_24h": 4200000000,
    "percent_change_24h": 2.34,
    "galaxy_score": 72,
    "alt_rank": 8,
    "social_volume_24h": 85000,
    "social_score": 68,
    "market_dominance": 3.87,
    "sentiment": 0.72     // 0-1, where > 0.5 = bullish
  }
}
```

### Option B: LunarCrush MCP Server (paid, for Claude agent context)

Connect via HTTP MCP:
```
https://lunarcrush.ai/mcp
Authorization: Bearer YOUR_API_KEY
```

Available MCP tools (11 total, including):
- `get_coin_data` — full coin metrics
- `get_trending_coins` — what's gaining social momentum
- `get_social_feeds` — recent posts about an asset
- `get_influencer_posts` — key influencer mentions

The MCP server is useful when running as a Claude-based agent. For standalone Node.js scripts, the REST API is more appropriate.

### Registering / Getting an API Key

1. Go to: https://lunarcrush.com/developers/api/authentication
2. Sign up for a paid plan at: https://lunarcrush.com/pricing
3. Generate an API key from the developer dashboard
4. Add to `.env` as `LUNARCRUSH_API_KEY=your_key_here`

### Rate limits

- Depends on subscription tier — check current plan at time of purchase
- For daily morning briefing: any tier should be sufficient (1 call/day)

---

## Dependencies

```bash
pnpm add axios@^1.13.6 zod@^4.3.6 dotenv@^17.3.1 chalk@^5.6.2
pnpm add -D typescript@^5.9.3 tsx@^4.21.0 @types/node@^25.5.0
```

> ⚠️ Always run `npm show <package> version` before pinning to confirm latest.

---

## Input / Output

**Input (env vars — required for this script):**
```
LUNARCRUSH_API_KEY=your_api_key_here
```

If `LUNARCRUSH_API_KEY` is not set, the script returns `null` silently — it does not error.

**Output — TypeScript return type:**
```typescript
interface LunarCrushResult {
  sol: {
    galaxyScore: number;          // 0–100
    altRank: number;              // Lower = better relative performance
    socialVolume24h: number;
    sentiment: number;            // 0–1 (> 0.5 = bullish)
    sentimentLabel: 'Bullish' | 'Neutral' | 'Bearish';
    priceChange24h: number;
  };
  btc: {
    galaxyScore: number;
    socialVolume24h: number;
    sentiment: number;
  } | null;                       // Optional BTC context
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  emoji: string;
  summary: string;
}
```

**Example summary string:**
```
🌙 LunarCrush SOL: Galaxy 72 | AltRank #8 | Sentiment 72% Bullish — 🟢 Positive social momentum
```

---

## Alert Thresholds

| Galaxy Score | Sentiment | Signal |
|-------------|-----------|--------|
| > 70 | > 65% bullish | `BULLISH` |
| 40–70 | 40–65% | `NEUTRAL` |
| < 40 | < 40% bullish | `BEARISH` |

AltRank context:
- AltRank #1–10: SOL is outperforming nearly all alts socially
- AltRank #50+: SOL is underperforming socially — potential laggard

---

## Module Interface

```typescript
export async function getLunarCrush(): Promise<LunarCrushResult | null>
```

Returns `null` if API key not configured or request fails.

Standalone:
```bash
pnpm tsx src/scripts/lunarcrush.ts
```

---

## Error Handling

- Return `null` if `LUNARCRUSH_API_KEY` not in env (graceful disable)
- Return `null` on 401/403 (invalid key) with a one-time console warning
- Return `null` on rate limit (429) — do not crash morning briefing
- Validate response with Zod schema
- Timeout: 10 seconds

---

## Schedule

- Optional addition to `morning-briefing.ts`
- Enabled automatically when `LUNARCRUSH_API_KEY` is present in environment

---

## Notes

- Galaxy Score is LunarCrush's proprietary composite metric — it combines price performance, volume, social engagement, and developer activity
- AltRank is particularly useful: if SOL has high AltRank (e.g. #3) during a general alt-season, it's a strong long candidate
- The sentiment score captures the ratio of bullish to bearish posts — useful for detecting narrative extremes
- Future enhancement: track trending coins to spot if a competing L1 (e.g. SUI, APT, AVAX) is stealing social mindshare from SOL
