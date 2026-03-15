import axios from 'axios';
import { z } from 'zod';

// --- Zod schemas for exchange API responses ---

const BinanceFundingRateSchema = z.array(
  z.object({
    symbol: z.string(),
    fundingRate: z.string(),
    fundingTime: z.number(),
    markPrice: z.string(),
  })
).min(1);

const BinancePremiumIndexSchema = z.object({
  symbol: z.string(),
  markPrice: z.string(),
  nextFundingTime: z.number(),
  lastFundingRate: z.string(),
});

const BybitFundingHistorySchema = z.object({
  result: z.object({
    list: z.array(
      z.object({
        symbol: z.string(),
        fundingRate: z.string(),
        fundingRateTimestamp: z.string(),
      })
    ).min(1),
  }),
});

const BybitTickerSchema = z.object({
  result: z.object({
    list: z.array(
      z.object({
        symbol: z.string(),
        fundingRate: z.string(),
        nextFundingTime: z.string(),
        lastPrice: z.string(),
      })
    ).min(1),
  }),
});

// --- Output types ---

export interface ExchangeFunding {
  currentRate: number;
  annualised: number;
  nextSettlement: Date;
  predictedRate: number;
}

export interface FundingRateResult {
  solPrice: number;
  binance: ExchangeFunding | null;
  bybit: ExchangeFunding | null;
  average: {
    currentRate: number;
    annualised: number;
  };
  signal: 'CROWDED_LONG' | 'CROWDED_SHORT' | 'NEUTRAL';
  emoji: string;
  summary: string;
}

// --- Helpers ---

function annualise(rate: number): number {
  return rate * 3 * 365;
}

function deriveSignal(avgRate: number): 'CROWDED_LONG' | 'CROWDED_SHORT' | 'NEUTRAL' {
  if (avgRate > 0.0005) return 'CROWDED_LONG';
  if (avgRate < -0.0003) return 'CROWDED_SHORT';
  return 'NEUTRAL';
}

function deriveEmoji(signal: 'CROWDED_LONG' | 'CROWDED_SHORT' | 'NEUTRAL'): string {
  if (signal === 'CROWDED_LONG') return '\u{1F534}';   // red circle
  if (signal === 'CROWDED_SHORT') return '\u{1F7E2}';  // green circle
  return '\u{26AA}';                                     // white circle
}

function formatRate(rate: number): string {
  const pct = rate * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(4)}%`;
}

function formatAnnualised(ann: number): string {
  const pct = ann * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

// --- Exchange fetchers ---

interface BinanceData {
  currentRate: number;
  predictedRate: number;
  nextSettlement: Date;
  markPrice: number;
}

async function fetchBinance(): Promise<BinanceData> {
  const [fundingRes, premiumRes] = await Promise.all([
    axios.get('https://fapi.binance.com/fapi/v1/fundingRate', {
      params: { symbol: 'SOLUSDT', limit: 1 },
      timeout: 10_000,
    }),
    axios.get('https://fapi.binance.com/fapi/v1/premiumIndex', {
      params: { symbol: 'SOLUSDT' },
      timeout: 10_000,
    }),
  ]);

  const fundingParsed = BinanceFundingRateSchema.safeParse(fundingRes.data);
  if (!fundingParsed.success) {
    throw new Error(`Binance funding rate validation failed: ${fundingParsed.error.message}`);
  }

  const premiumParsed = BinancePremiumIndexSchema.safeParse(premiumRes.data);
  if (!premiumParsed.success) {
    throw new Error(`Binance premium index validation failed: ${premiumParsed.error.message}`);
  }

  const funding = fundingParsed.data[0];
  const premium = premiumParsed.data;

  return {
    currentRate: Number(funding.fundingRate),
    // Note: Binance premiumIndex.lastFundingRate is the most recently settled rate,
    // used here as the best available proxy for the predicted next rate
    // (Binance does not expose a true predicted next funding rate in public APIs)
    predictedRate: parseFloat(premium.lastFundingRate),
    nextSettlement: new Date(premium.nextFundingTime),
    markPrice: Number(premium.markPrice),
  };
}

interface BybitData {
  currentRate: number;
  predictedRate: number;
  nextSettlement: Date;
  lastPrice: number;
}

async function fetchBybit(): Promise<BybitData> {
  const [historyRes, tickerRes] = await Promise.all([
    axios.get('https://api.bybit.com/v5/market/funding/history', {
      params: { category: 'linear', symbol: 'SOLUSDT', limit: 1 },
      timeout: 10_000,
    }),
    axios.get('https://api.bybit.com/v5/market/tickers', {
      params: { category: 'linear', symbol: 'SOLUSDT' },
      timeout: 10_000,
    }),
  ]);

  const historyParsed = BybitFundingHistorySchema.safeParse(historyRes.data);
  if (!historyParsed.success) {
    throw new Error(`Bybit funding history validation failed: ${historyParsed.error.message}`);
  }

  const tickerParsed = BybitTickerSchema.safeParse(tickerRes.data);
  if (!tickerParsed.success) {
    throw new Error(`Bybit ticker validation failed: ${tickerParsed.error.message}`);
  }

  const history = historyParsed.data.result.list[0];
  const ticker = tickerParsed.data.result.list[0];

  return {
    currentRate: Number(history.fundingRate),
    predictedRate: Number(ticker.fundingRate),
    nextSettlement: new Date(Number(ticker.nextFundingTime)),
    lastPrice: Number(ticker.lastPrice),
  };
}

// --- Main exported function ---

export async function getFundingRate(): Promise<FundingRateResult | null> {
  try {
    const results = await Promise.allSettled([fetchBinance(), fetchBybit()]);

    const binanceResult = results[0];
    const bybitResult = results[1];

    const binanceOk = binanceResult.status === 'fulfilled' ? binanceResult.value : null;
    const bybitOk = bybitResult.status === 'fulfilled' ? bybitResult.value : null;

    // Both failed
    if (binanceOk === null && bybitOk === null) {
      const binanceErr = binanceResult.status === 'rejected' ? binanceResult.reason : 'unknown';
      const bybitErr = bybitResult.status === 'rejected' ? bybitResult.reason : 'unknown';
      console.error('[funding-rate] Both exchanges failed:', { binance: binanceErr, bybit: bybitErr });
      return null;
    }

    // Build ExchangeFunding objects
    const binance: ExchangeFunding | null = binanceOk
      ? {
          currentRate: binanceOk.currentRate,
          annualised: annualise(binanceOk.currentRate),
          nextSettlement: binanceOk.nextSettlement,
          predictedRate: binanceOk.predictedRate,
        }
      : null;

    const bybit: ExchangeFunding | null = bybitOk
      ? {
          currentRate: bybitOk.currentRate,
          annualised: annualise(bybitOk.currentRate),
          nextSettlement: bybitOk.nextSettlement,
          predictedRate: bybitOk.predictedRate,
        }
      : null;

    // Average from available exchanges
    const rates: number[] = [];
    if (binance) rates.push(binance.currentRate);
    if (bybit) rates.push(bybit.currentRate);
    const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
    const avgAnnualised = annualise(avgRate);

    // SOL price from first available exchange
    const solPrice = binanceOk?.markPrice ?? bybitOk?.lastPrice ?? 0;

    // Signal
    const signal = deriveSignal(avgRate);
    const emoji = deriveEmoji(signal);

    // Summary
    const rateStr = formatRate(avgRate);
    const annStr = formatAnnualised(avgAnnualised);

    let signalText: string;
    if (signal === 'CROWDED_LONG') {
      signalText = `Crowded LONG \u26A0\uFE0F \u2014 Favours short entries`;
    } else if (signal === 'CROWDED_SHORT') {
      signalText = `Crowded SHORT \u26A0\uFE0F \u2014 Favours long entries`;
    } else {
      signalText = 'Neutral';
    }

    const partialNote = (binance === null || bybit === null) ? ' (partial data)' : '';
    const summary = `\u{1F4C8} SOL Funding: ${rateStr}/8h (ann. ${annStr}) \u2014 ${signalText}${partialNote}`;

    return {
      solPrice,
      binance,
      bybit,
      average: {
        currentRate: avgRate,
        annualised: avgAnnualised,
      },
      signal,
      emoji,
      summary,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[funding-rate] Unexpected error:', message);
    return null;
  }
}

// --- Standalone execution ---

const isMain = process.argv[1] != null &&
  (process.argv[1].endsWith('/funding-rate.ts') || process.argv[1].endsWith('/funding-rate.js'));

if (isMain) {
  getFundingRate().then((result) => {
    if (result) console.log(result.summary);
    else console.error('Failed to fetch funding rate data');
  });
}
