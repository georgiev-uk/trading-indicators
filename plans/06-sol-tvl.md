# Plan: 06 — Solana Ecosystem TVL (`sol-tvl.ts`)

## Purpose

Tracks Total Value Locked (TVL) in the Solana DeFi ecosystem via the DefiLlama free API. TVL is a proxy for network health and capital confidence in the Solana ecosystem:

- **Rising TVL** = capital flowing into Solana DeFi → healthy ecosystem, supports SOL price
- **Falling TVL** = capital leaving Solana DeFi → ecosystem stress signal
- **Sharp TVL drop (> 10% in 24h)** = potential protocol exploit, rug pull, or macro fear → avoid longs

This is the NVT-equivalent signal for Solana specifically (from Cryptoassets by Burniske): if price is stable but TVL is collapsing, the network is losing utility value.

---

## Data Source

**DefiLlama Chains API (free, no auth, no rate limit):**
```
GET https://api.llama.fi/v2/chains
```

Returns an array of all tracked blockchain networks with their current TVL and 1-day/7-day/30-day changes.

**Sample response entry for Solana:**
```json
{
  "gecko_id": "solana",
  "tvl": 8420000000,
  "tokenSymbol": "SOL",
  "cmcId": "5426",
  "name": "Solana",
  "chainId": 0,
  "change_1d": 3.42,
  "change_7d": -5.21,
  "change_1m": 12.8
}
```

**Top Solana protocols (optional enrichment):**
```
GET https://api.llama.fi/protocols
```
Filter by `chain: "Solana"` to get per-protocol TVL breakdown (Marinade, Jito, Raydium, Jupiter, etc.)

### Rate limits
- DefiLlama: no hard rate limit on free tier — the API is fully open
- No authentication required

---

## Dependencies

```bash
pnpm add axios@^1.13.6 zod@^4.3.6 dotenv@^17.3.1 chalk@^5.6.2 dayjs@^1.11.20
pnpm add -D typescript@^5.9.3 tsx@^4.21.0 @types/node@^25.5.0
```

> ⚠️ Always run `npm show <package> version` before pinning to confirm latest.

---

## Input / Output

**Input:** None

**Output — TypeScript return type:**
```typescript
interface SolTVLResult {
  tvlUsd: number;               // e.g. 8420000000 (raw USD)
  tvlFormatted: string;         // e.g. "$8.42B"
  change1d: number;             // percentage, e.g. 3.42
  change7d: number;
  change1m: number;
  topProtocols: Array<{         // Top 5 by TVL on Solana
    name: string;
    tvlUsd: number;
    change1d: number;
  }>;
  signal: 'CAUTION' | 'NEUTRAL' | 'HEALTHY';
  emoji: string;
  summary: string;
}
```

**Example summary strings:**
```
🏗️ Solana TVL: $8.42B (+3.4% 24h, -5.2% 7d) ✅ Ecosystem healthy
```
```
🏗️ Solana TVL: $6.10B (-12.3% 24h) ⚠️ CAUTION — Sharp TVL drop, avoid new longs
```

---

## Alert Thresholds

| 24h Change | Signal | Interpretation |
|-----------|--------|---------------|
| < -10% | `CAUTION` | Sharp capital outflow — potential exploit or macro panic |
| -10% to -3% | `NEUTRAL` | Normal fluctuation |
| -3% to +3% | `NEUTRAL` | Stable |
| > +3% | `HEALTHY` | Capital inflow — positive for SOL |

7-day trend also reported for context (directional health).

---

## Module Interface

```typescript
export async function getSolTVL(): Promise<SolTVLResult>
```

Standalone:
```bash
pnpm tsx src/scripts/sol-tvl.ts
```

---

## Error Handling

- DefiLlama is very reliable but handle network failures gracefully
- If Solana not found in response: return `null` with warning (unlikely)
- Validate response array with Zod (loose schema — chain data structure may vary)
- Timeout: 10 seconds
- The `topProtocols` enrichment is optional — skip if `/protocols` call fails, proceed with chain-level data only

---

## Schedule

- Part of `morning-briefing.ts` (07:30 UTC daily)

---

## Notes

- DefiLlama's `/v2/chains` updates roughly every hour
- TVL is denominated in USD — a TVL drop can be caused by SOL price falling (not necessarily capital leaving). The 24h change is price-adjusted by DefiLlama.
- For context: Solana TVL peaked at ~$12B in late 2021, bottomed at ~$0.5B in 2023, recovered to ~$8–10B by 2025
- If a sharp TVL drop occurs and price hasn't moved yet, that's an early warning signal — the price drop may be coming
