import axios from 'axios';
import { z } from 'zod';

// --- Zod schemas for exchange API responses ---

const BybitAccountRatioSchema = z.object({
  result: z.object({
    list: z.array(
      z.object({
        symbol: z.string(),
        buyRatio: z.string(),
        sellRatio: z.string(),
        timestamp: z.string(),
      })
    ).min(1),
  }),
});

const BinanceLSRatioSchema = z.array(
  z.object({
    symbol: z.string(),
    longShortRatio: z.string(),
    longAccount: z.string(),
    shortAccount: z.string(),
    timestamp: z.number(),
  })
).min(1);

// --- Output types ---

export interface ExchangeLSRatio {
  longPct: number;     // percentage, e.g. 65.23
  shortPct: number;    // percentage, e.g. 34.77
  timestamp: Date;
}

export interface LSRatioResult {
  bybit: ExchangeLSRatio | null;
  binance: ExchangeLSRatio | null;
  average: {
    longPct: number;
    shortPct: number;
  };
  signal: 'CROWDED_LONG' | 'CROWDED_SHORT' | 'NEUTRAL';
  emoji: string;
  summary: string;
}

// --- Helpers ---

function deriveSignal(avgLongPct: number): 'CROWDED_LONG' | 'CROWDED_SHORT' | 'NEUTRAL' {
  if (avgLongPct > 65) return 'CROWDED_LONG';
  if (avgLongPct < 35) return 'CROWDED_SHORT';
  return 'NEUTRAL';
}

function deriveEmoji(signal: 'CROWDED_LONG' | 'CROWDED_SHORT' | 'NEUTRAL'): string {
  if (signal === 'CROWDED_LONG') return '\u{1F534}';   // red circle
  if (signal === 'CROWDED_SHORT') return '\u{1F7E2}';  // green circle
  return '\u{26AA}';                                     // white circle
}

// --- Exchange fetchers ---

interface BybitLSData {
  longPct: number;
  shortPct: number;
  timestamp: Date;
}

async function fetchBybit(): Promise<BybitLSData> {
  const res = await axios.get('https://api.bybit.com/v5/market/account-ratio', {
    params: { category: 'linear', symbol: 'SOLUSDT', period: '1h', limit: 1 },
    timeout: 10_000,
  });

  const parsed = BybitAccountRatioSchema.safeParse(res.data);
  if (!parsed.success) {
    throw new Error(`Bybit account ratio validation failed: ${parsed.error.message}`);
  }

  const item = parsed.data.result.list[0];
  return {
    longPct: Number(item.buyRatio) * 100,
    shortPct: Number(item.sellRatio) * 100,
    timestamp: new Date(Number(item.timestamp)),
  };
}

interface BinanceLSData {
  longPct: number;
  shortPct: number;
  timestamp: Date;
}

async function fetchBinance(): Promise<BinanceLSData> {
  const res = await axios.get('https://fapi.binance.com/futures/data/globalLongShortAccountRatio', {
    params: { symbol: 'SOLUSDT', period: '1h', limit: 1 },
    timeout: 10_000,
  });

  const parsed = BinanceLSRatioSchema.safeParse(res.data);
  if (!parsed.success) {
    throw new Error(`Binance L/S ratio validation failed: ${parsed.error.message}`);
  }

  const item = parsed.data[0];
  return {
    longPct: Number(item.longAccount) * 100,
    shortPct: Number(item.shortAccount) * 100,
    timestamp: new Date(item.timestamp),
  };
}

// --- Main exported function ---

export async function getLSRatio(): Promise<LSRatioResult | null> {
  try {
    const results = await Promise.allSettled([fetchBybit(), fetchBinance()]);

    const bybitResult = results[0];
    const binanceResult = results[1];

    const bybitOk = bybitResult.status === 'fulfilled' ? bybitResult.value : null;
    const binanceOk = binanceResult.status === 'fulfilled' ? binanceResult.value : null;

    // Both failed
    if (bybitOk === null && binanceOk === null) {
      const bybitErr = bybitResult.status === 'rejected' ? bybitResult.reason : 'unknown';
      const binanceErr = binanceResult.status === 'rejected' ? binanceResult.reason : 'unknown';
      console.error('[ls-ratio] Both exchanges failed:', { bybit: bybitErr, binance: binanceErr });
      return null;
    }

    // Build ExchangeLSRatio objects
    const bybit: ExchangeLSRatio | null = bybitOk
      ? { longPct: bybitOk.longPct, shortPct: bybitOk.shortPct, timestamp: bybitOk.timestamp }
      : null;

    const binance: ExchangeLSRatio | null = binanceOk
      ? { longPct: binanceOk.longPct, shortPct: binanceOk.shortPct, timestamp: binanceOk.timestamp }
      : null;

    // Average from available exchanges
    const longPcts: number[] = [];
    const shortPcts: number[] = [];
    if (bybit) {
      longPcts.push(bybit.longPct);
      shortPcts.push(bybit.shortPct);
    }
    if (binance) {
      longPcts.push(binance.longPct);
      shortPcts.push(binance.shortPct);
    }
    const avgLongPct = longPcts.reduce((a, b) => a + b, 0) / longPcts.length;
    const avgShortPct = shortPcts.reduce((a, b) => a + b, 0) / shortPcts.length;

    // Signal
    const signal = deriveSignal(avgLongPct);
    const emoji = deriveEmoji(signal);

    // Summary
    let signalText: string;
    if (signal === 'CROWDED_LONG') {
      signalText = '\u{26A0}\u{FE0F} Crowded LONG';
    } else if (signal === 'CROWDED_SHORT') {
      signalText = '\u{26A0}\u{FE0F} Crowded SHORT';
    } else {
      signalText = '\u{2014} Neutral';
    }

    const summary = `\u{2696}\u{FE0F} SOL L/S: ${avgLongPct.toFixed(1)}% Long / ${avgShortPct.toFixed(1)}% Short ${signalText}`;

    return {
      bybit,
      binance,
      average: {
        longPct: avgLongPct,
        shortPct: avgShortPct,
      },
      signal,
      emoji,
      summary,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ls-ratio] Unexpected error:', message);
    return null;
  }
}

// --- Standalone execution ---

const isMain = process.argv[1] != null &&
  (process.argv[1].endsWith('/ls-ratio.ts') || process.argv[1].endsWith('/ls-ratio.js'));

if (isMain) {
  getLSRatio().then((result) => {
    if (result) console.log(result.summary);
    else console.error('Failed to fetch L/S ratio data');
  });
}
