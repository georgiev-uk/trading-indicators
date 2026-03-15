import axios from 'axios';
import { z } from 'zod';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

// --- Constants ---

const GLOBAL_URL = 'https://api.coingecko.com/api/v3/global';
const SOL_PRICE_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true';
const CACHE_PATH = '/workspace/extra/trading-indicators/data/btc-dominance-cache.json';
const AXIOS_TIMEOUT = 10_000;

// --- Zod schemas ---

const GlobalResponseSchema = z.object({
  data: z.object({
    market_cap_percentage: z.object({
      btc: z.number(),
      eth: z.number(),
      sol: z.number(),
    }),
    total_market_cap: z.object({
      usd: z.number(),
    }),
    total_volume: z.object({
      usd: z.number(),
    }),
    market_cap_change_percentage_24h_usd: z.number(),
  }),
});

const SolPriceResponseSchema = z.object({
  solana: z.object({
    usd: z.number(),
    usd_24h_change: z.number(),
  }),
});

const CacheSchema = z.object({
  btcDominance: z.number(),
  fetchedAt: z.string(),
});

// --- Output type ---

export interface BTCDominanceResult {
  btcDominance: number;
  ethDominance: number;
  solDominance: number;
  totalMarketCapUsd: number;
  totalMarketCap24hChangePct: number;
  solPriceUsd: number;
  sol24hChangePct: number;
  btcDominance24hChange: number | null;
  signal: 'RISK_OFF' | 'RISK_ON' | 'NEUTRAL';
  emoji: string;
  summary: string;
}

// --- Retry helper for CoinGecko 429 rate-limit ---

async function fetchWithRetry(url: string, timeout: number) {
  try {
    return await axios.get(url, { timeout });
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response?.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return await axios.get(url, { timeout });
    }
    throw err;
  }
}

// --- Helpers ---

interface CacheData {
  btcDominance: number;
  fetchedAt: string;
}

async function readCache(): Promise<CacheData | null> {
  try {
    const raw = await readFile(CACHE_PATH, 'utf-8');
    const parsed = CacheSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

async function writeCache(btcDominance: number): Promise<void> {
  try {
    const data: CacheData = {
      btcDominance,
      fetchedAt: new Date().toISOString(),
    };
    await mkdir(dirname(CACHE_PATH), { recursive: true });
    await writeFile(CACHE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[btc-dominance] Failed to write cache:', message);
  }
}

function deriveSignal(change: number | null): 'RISK_OFF' | 'RISK_ON' | 'NEUTRAL' {
  if (change === null) return 'NEUTRAL';
  if (change > 1.5) return 'RISK_OFF';
  if (change < -1.5) return 'RISK_ON';
  return 'NEUTRAL';
}

function deriveEmoji(signal: 'RISK_OFF' | 'RISK_ON' | 'NEUTRAL'): string {
  if (signal === 'RISK_OFF') return '\u{1F534}';
  if (signal === 'RISK_ON') return '\u{1F7E2}';
  return '\u26AA';
}

function buildSummary(
  btcDominance: number,
  change: number | null,
  signal: 'RISK_OFF' | 'RISK_ON' | 'NEUTRAL',
): string {
  const changePart =
    change === null
      ? '(no prior data)'
      : `(${change >= 0 ? '+' : ''}${change.toFixed(1)}% 24h)`;

  let signalPart: string;
  if (signal === 'RISK_OFF') {
    signalPart = '\u26A0\uFE0F RISK OFF \u2014 BTC dominance rising, alts under pressure';
  } else if (signal === 'RISK_ON') {
    signalPart = '\u{1F680} RISK ON \u2014 Capital rotating to alts';
  } else {
    signalPart = 'Neutral';
  }

  return `\u{1F4CA} BTC.D: ${btcDominance.toFixed(1)}% ${changePart} \u2014 ${signalPart}`;
}

// --- Main exported function ---

export async function getBTCDominance(): Promise<BTCDominanceResult | null> {
  try {
    // Read cache (non-fatal)
    const cache = await readCache();

    // Fetch both endpoints in parallel
    const [globalResult, solResult] = await Promise.allSettled([
      fetchWithRetry(GLOBAL_URL, AXIOS_TIMEOUT),
      fetchWithRetry(SOL_PRICE_URL, AXIOS_TIMEOUT),
    ]);

    // Global endpoint is critical
    if (globalResult.status === 'rejected') {
      console.error('[btc-dominance] Global endpoint failed:', globalResult.reason);
      return null;
    }

    const globalParsed = GlobalResponseSchema.safeParse(globalResult.value.data);
    if (!globalParsed.success) {
      console.error('[btc-dominance] Invalid global response:', globalParsed.error.message);
      return null;
    }

    const globalData = globalParsed.data.data;

    // SOL price is non-critical
    let solPriceUsd = 0;
    let sol24hChangePct = 0;

    if (solResult.status === 'fulfilled') {
      const solParsed = SolPriceResponseSchema.safeParse(solResult.value.data);
      if (solParsed.success) {
        solPriceUsd = solParsed.data.solana.usd;
        sol24hChangePct = solParsed.data.solana.usd_24h_change;
      }
    }

    const btcDominance = globalData.market_cap_percentage.btc;

    // Calculate 24h change from cache
    const btcDominance24hChange =
      cache !== null
        ? Math.round((btcDominance - cache.btcDominance) * 100) / 100
        : null;

    const signal = deriveSignal(btcDominance24hChange);
    const emoji = deriveEmoji(signal);
    const summary = buildSummary(btcDominance, btcDominance24hChange, signal);

    // Write cache (non-fatal)
    void writeCache(btcDominance);

    return {
      btcDominance,
      ethDominance: globalData.market_cap_percentage.eth,
      solDominance: globalData.market_cap_percentage.sol,
      totalMarketCapUsd: globalData.total_market_cap.usd,
      totalMarketCap24hChangePct: globalData.market_cap_change_percentage_24h_usd,
      solPriceUsd,
      sol24hChangePct,
      btcDominance24hChange,
      signal,
      emoji,
      summary,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[btc-dominance] Unexpected error:', message);
    return null;
  }
}

// --- Standalone execution ---

const isMain =
  process.argv[1] != null &&
  (process.argv[1].endsWith('/btc-dominance.ts') || process.argv[1].endsWith('/btc-dominance.js'));

if (isMain) {
  getBTCDominance().then((result) => {
    if (result) console.log(result.summary);
    else console.error('Failed to fetch BTC dominance data');
  });
}
