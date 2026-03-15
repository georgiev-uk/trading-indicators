import axios from 'axios';
import { z } from 'zod';

// --- Zod schema for the DefiLlama chains API response ---

const ChainSchema = z.object({
  name: z.string(),
  tvl: z.number(),
  change_1d: z.number().nullable().optional(),
  change_7d: z.number().nullable().optional(),
  change_1m: z.number().nullable().optional(),
}).passthrough();

const ChainsResponseSchema = z.array(ChainSchema);

// --- Output types ---

export interface SolTVLResult {
  tvlUsd: number;
  tvlFormatted: string;
  change1d: number;
  change7d: number;
  change1m: number;
  signal: 'CAUTION' | 'NEUTRAL' | 'HEALTHY';
  emoji: string;
  summary: string;
}

// --- Helpers ---

function formatTVL(tvl: number): string {
  if (tvl >= 1_000_000_000) {
    return `$${(tvl / 1_000_000_000).toFixed(2)}B`;
  }
  if (tvl >= 1_000_000) {
    return `$${(tvl / 1_000_000).toFixed(2)}M`;
  }
  return `$${tvl}`;
}

function deriveSignal(change1d: number): 'CAUTION' | 'NEUTRAL' | 'HEALTHY' {
  if (change1d < -10) return 'CAUTION';
  if (change1d > 3) return 'HEALTHY';
  return 'NEUTRAL';
}

function deriveEmoji(signal: 'CAUTION' | 'NEUTRAL' | 'HEALTHY'): string {
  if (signal === 'CAUTION') return '\u{1F6A8}';   // 🚨
  if (signal === 'HEALTHY') return '\u{1F7E2}';    // 🟢
  return '\u26AA';                                    // ⚪
}

function formatChange(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

// --- Main exported function ---

const API_URL = 'https://api.llama.fi/v2/chains';

export async function getSolTVL(): Promise<SolTVLResult | null> {
  try {
    const response = await axios.get(API_URL, { timeout: 10_000 });

    const parsed = ChainsResponseSchema.safeParse(response.data);
    if (!parsed.success) {
      console.error('[sol-tvl] Invalid API response:', parsed.error.message);
      return null;
    }

    const solana = parsed.data.find((chain) => chain.name === 'Solana');
    if (!solana) {
      console.error('[sol-tvl] Solana not found in chains response');
      return null;
    }

    const tvlUsd = solana.tvl;
    const change1d = solana.change_1d ?? 0;
    const change7d = solana.change_7d ?? 0;
    const change1m = solana.change_1m ?? 0;

    const tvlFormatted = formatTVL(tvlUsd);
    const signal = deriveSignal(change1d);
    const emoji = deriveEmoji(signal);

    let signalText: string;
    if (signal === 'CAUTION') {
      signalText = `\u{1F6A8} CAUTION \u2014 Sharp TVL drop`;
    } else if (signal === 'HEALTHY') {
      signalText = `\u2705 Ecosystem healthy`;
    } else {
      signalText = `\u2014 Neutral`;
    }

    const summary = `\u{1F3D7}\uFE0F Solana TVL: ${tvlFormatted} (${formatChange(change1d)} 24h, ${formatChange(change7d)} 7d) ${signalText}`;

    return {
      tvlUsd,
      tvlFormatted,
      change1d,
      change7d,
      change1m,
      signal,
      emoji,
      summary,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[sol-tvl] Failed to fetch data:', message);
    return null;
  }
}

// --- Standalone execution ---

const isMain = process.argv[1] != null &&
  (process.argv[1].endsWith('/sol-tvl.ts') || process.argv[1].endsWith('/sol-tvl.js'));

if (isMain) {
  getSolTVL().then((result) => {
    if (result) console.log(result.summary);
    else console.error('Failed to fetch Solana TVL data');
  });
}
