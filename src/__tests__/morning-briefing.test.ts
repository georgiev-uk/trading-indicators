import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FearGreedResult } from '../scripts/fear-greed.js';
import type { FundingRateResult } from '../scripts/funding-rate.js';
import type { LSRatioResult } from '../scripts/ls-ratio.js';
import type { MacroCalendarResult } from '../scripts/macro-calendar.js';
import type { BTCDominanceResult } from '../scripts/btc-dominance.js';
import type { SolTVLResult } from '../scripts/sol-tvl.js';
import type { CryptoPanicResult } from '../scripts/cryptopanic.js';

vi.mock('../scripts/fear-greed.js');
vi.mock('../scripts/funding-rate.js');
vi.mock('../scripts/ls-ratio.js');
vi.mock('../scripts/macro-calendar.js');
vi.mock('../scripts/btc-dominance.js');
vi.mock('../scripts/sol-tvl.js');
vi.mock('../scripts/cryptopanic.js');

// Import after mocking
const { getFearGreed } = await import('../scripts/fear-greed.js');
const { getFundingRate } = await import('../scripts/funding-rate.js');
const { getLSRatio } = await import('../scripts/ls-ratio.js');
const { getMacroCalendar } = await import('../scripts/macro-calendar.js');
const { getBTCDominance } = await import('../scripts/btc-dominance.js');
const { getSolTVL } = await import('../scripts/sol-tvl.js');
const { getCryptoPanic } = await import('../scripts/cryptopanic.js');
const { runMorningBriefing, computeStance } = await import('../scripts/morning-briefing.js');

// --- Helpers to build mock results ---

function makeFearGreed(signal: FearGreedResult['signal'] = 'NEUTRAL'): FearGreedResult {
  return {
    current: { value: 50, classification: 'Neutral', timestamp: new Date() },
    trend: [],
    signal,
    emoji: '😐',
    summary: '😐 Fear & Greed Index: 50 (Neutral) — Signal: NEUTRAL',
  };
}

function makeFundingRate(signal: FundingRateResult['signal'] = 'NEUTRAL'): FundingRateResult {
  return {
    solPrice: 150,
    binance: null,
    bybit: null,
    average: { currentRate: 0.0001, annualised: 0.1095 },
    signal,
    emoji: '⚪',
    summary: '📈 SOL Funding: +0.0100%/8h (ann. +11.0%) — Neutral',
  };
}

function makeLSRatio(signal: LSRatioResult['signal'] = 'NEUTRAL'): LSRatioResult {
  return {
    bybit: null,
    binance: null,
    average: { longPct: 50, shortPct: 50 },
    signal,
    emoji: '⚪',
    summary: '⚖️ SOL L/S: 50.0% Long / 50.0% Short — Neutral',
  };
}

function makeMacroCalendar(signal: MacroCalendarResult['signal'] = 'CLEAR'): MacroCalendarResult {
  return {
    today: [],
    highImpact: [],
    hasHighImpactToday: false,
    nextHighImpact: null,
    signal,
    summary: '📅 Macro: ✅ No high-impact USD events today — clear to trade',
  };
}

function makeBTCDominance(signal: BTCDominanceResult['signal'] = 'NEUTRAL'): BTCDominanceResult {
  return {
    btcDominance: 56.4,
    ethDominance: 12.1,
    solDominance: 3.2,
    totalMarketCapUsd: 2_500_000_000_000,
    totalMarketCap24hChangePct: 0.5,
    solPriceUsd: 150,
    sol24hChangePct: 1.2,
    btcDominance24hChange: 0.3,
    signal,
    emoji: '⚪',
    summary: '📊 BTC.D: 56.4% (+0.3% 24h) — Neutral',
  };
}

function makeSolTVL(signal: SolTVLResult['signal'] = 'NEUTRAL'): SolTVLResult {
  return {
    tvlUsd: 8_420_000_000,
    tvlFormatted: '$8.42B',
    change1d: 1.2,
    change7d: 3.5,
    change1m: 8.0,
    signal,
    emoji: '⚪',
    summary: '🏗️ Solana TVL: $8.42B (+1.2% 24h, +3.5% 7d) — Neutral',
  };
}

function makeCryptoPanic(signal: CryptoPanicResult['signal'] = 'NEUTRAL'): CryptoPanicResult {
  return {
    totalPosts: 20,
    bullishCount: 10,
    bearishCount: 10,
    neutralCount: 0,
    bullishRatio: 0.5,
    topHeadlines: ['Headline 1', 'Headline 2', 'Headline 3'],
    signal,
    summary: '\u{1F4F0} News: 10/20 bullish \u2014 Mixed sentiment',
  };
}

function mockAllNeutral(): void {
  vi.mocked(getFearGreed).mockResolvedValue(makeFearGreed('NEUTRAL'));
  vi.mocked(getFundingRate).mockResolvedValue(makeFundingRate('NEUTRAL'));
  vi.mocked(getLSRatio).mockResolvedValue(makeLSRatio('NEUTRAL'));
  vi.mocked(getMacroCalendar).mockResolvedValue(makeMacroCalendar('CLEAR'));
  vi.mocked(getBTCDominance).mockResolvedValue(makeBTCDominance('NEUTRAL'));
  vi.mocked(getSolTVL).mockResolvedValue(makeSolTVL('NEUTRAL'));
  vi.mocked(getCryptoPanic).mockResolvedValue(makeCryptoPanic('NEUTRAL'));
}

function mockAllNull(): void {
  vi.mocked(getFearGreed).mockResolvedValue(null);
  vi.mocked(getFundingRate).mockResolvedValue(null);
  vi.mocked(getLSRatio).mockResolvedValue(null);
  vi.mocked(getMacroCalendar).mockResolvedValue(null as unknown as MacroCalendarResult);
  vi.mocked(getBTCDominance).mockResolvedValue(null);
  vi.mocked(getSolTVL).mockResolvedValue(null);
  vi.mocked(getCryptoPanic).mockResolvedValue(null);
}

// --- Tests ---

beforeEach(() => {
  vi.resetAllMocks();
});

describe('runMorningBriefing', () => {
  it('contains date header when all scripts succeed', async () => {
    mockAllNeutral();
    const msg = await runMorningBriefing();
    expect(msg).toContain('🌅 *Morning Briefing —');
  });

  it('returns NEUTRAL stance when no strong signals', async () => {
    mockAllNeutral();
    const msg = await runMorningBriefing();
    expect(msg).toContain('*Trading Stance: NEUTRAL*');
    expect(msg).toContain('Trade z-score entries as normal');
  });

  it('returns FAVOUR SHORTS when 2+ short signals', async () => {
    mockAllNeutral();
    vi.mocked(getFearGreed).mockResolvedValue(makeFearGreed('AVOID_LONGS'));
    vi.mocked(getFundingRate).mockResolvedValue(makeFundingRate('CROWDED_LONG'));
    const msg = await runMorningBriefing();
    expect(msg).toContain('*Trading Stance: FAVOUR SHORTS*');
    expect(msg).toContain('Wait for z-score > 1.5 entry');
  });

  it('returns FAVOUR LONGS when 2+ long signals', async () => {
    mockAllNeutral();
    vi.mocked(getFearGreed).mockResolvedValue(makeFearGreed('AVOID_SHORTS'));
    vi.mocked(getLSRatio).mockResolvedValue(makeLSRatio('CROWDED_SHORT'));
    const msg = await runMorningBriefing();
    expect(msg).toContain('*Trading Stance: FAVOUR LONGS*');
    expect(msg).toContain('Wait for z-score < -1.5 entry');
  });

  it('returns CAUTION when RISK_OFF signal present', async () => {
    mockAllNeutral();
    vi.mocked(getBTCDominance).mockResolvedValue(makeBTCDominance('RISK_OFF'));
    const msg = await runMorningBriefing();
    expect(msg).toContain('*Trading Stance: CAUTION*');
    expect(msg).toContain('reduce position sizing to 50%');
  });

  it('returns CAUTION when CAUTION signal from SOL TVL', async () => {
    mockAllNeutral();
    vi.mocked(getSolTVL).mockResolvedValue(makeSolTVL('CAUTION'));
    const msg = await runMorningBriefing();
    expect(msg).toContain('*Trading Stance: CAUTION*');
  });

  it('shows fallback text when one script returns null', async () => {
    mockAllNeutral();
    vi.mocked(getFearGreed).mockResolvedValue(null);
    const msg = await runMorningBriefing();
    expect(msg).toContain('⚠️ Sentiment unavailable');
    // Other sections should still be present
    expect(msg).toContain('📈 SOL Funding');
  });

  it('returns minimal failure message when all scripts fail', async () => {
    mockAllNull();
    const msg = await runMorningBriefing();
    expect(msg).toBe('⚠️ Morning briefing failed — all data sources unavailable');
  });

  it('handles one rejected promise as fallback', async () => {
    mockAllNeutral();
    vi.mocked(getFundingRate).mockRejectedValue(new Error('network error'));
    const msg = await runMorningBriefing();
    expect(msg).toContain('⚠️');
    expect(msg).toContain('unavailable');
    // Other sections should still be present
    expect(msg).toContain('Fear & Greed');
  });

  it('returns failure message when all scripts reject or return null', async () => {
    vi.mocked(getFearGreed).mockRejectedValue(new Error('fail'));
    vi.mocked(getFundingRate).mockRejectedValue(new Error('fail'));
    vi.mocked(getLSRatio).mockRejectedValue(new Error('fail'));
    vi.mocked(getMacroCalendar).mockRejectedValue(new Error('fail'));
    vi.mocked(getBTCDominance).mockRejectedValue(new Error('fail'));
    vi.mocked(getSolTVL).mockRejectedValue(new Error('fail'));
    vi.mocked(getCryptoPanic).mockRejectedValue(new Error('fail'));
    const msg = await runMorningBriefing();
    expect(msg).toBe('⚠️ Morning briefing failed — all data sources unavailable');
  });

  it('shows sections in correct order: Sentiment, Funding, L/S, Macro, BTC.D, TVL, News', async () => {
    mockAllNeutral();
    const msg = await runMorningBriefing();

    const sentimentIdx = msg.indexOf('Fear & Greed');
    const fundingIdx = msg.indexOf('SOL Funding');
    const lsIdx = msg.indexOf('SOL L/S');
    const macroIdx = msg.indexOf('Macro');
    const btcdIdx = msg.indexOf('BTC.D');
    const tvlIdx = msg.indexOf('Solana TVL');
    const newsIdx = msg.indexOf('News:');

    expect(sentimentIdx).toBeLessThan(fundingIdx);
    expect(fundingIdx).toBeLessThan(lsIdx);
    expect(lsIdx).toBeLessThan(macroIdx);
    expect(macroIdx).toBeLessThan(btcdIdx);
    expect(btcdIdx).toBeLessThan(tvlIdx);
    expect(tvlIdx).toBeLessThan(newsIdx);
  });
});

describe('computeStance', () => {
  it('returns FAVOUR SHORTS with exactly 2 short signals', () => {
    const result = computeStance(['AVOID_LONGS', 'CROWDED_LONG']);
    expect(result.stance).toBe('FAVOUR SHORTS');
    expect(result.note).toBe('2/3 signals aligned short');
  });

  it('returns FAVOUR LONGS with exactly 2 long signals', () => {
    const result = computeStance(['AVOID_SHORTS', 'CROWDED_SHORT']);
    expect(result.stance).toBe('FAVOUR LONGS');
    expect(result.note).toBe('2/3 signals aligned long');
  });

  it('counts RISK_ON as a long signal', () => {
    const result = computeStance(['AVOID_SHORTS', 'RISK_ON']);
    expect(result.stance).toBe('FAVOUR LONGS');
    expect(result.note).toBe('2/3 signals aligned long');
  });

  it('counts RISK_OFF as a caution signal', () => {
    const result = computeStance(['RISK_OFF']);
    expect(result.stance).toBe('CAUTION');
    expect(result.note).toBe('Risk-off signal active — reduce size');
  });

  it('returns NEUTRAL when 1 short + 1 long (no majority)', () => {
    const result = computeStance(['AVOID_LONGS', 'AVOID_SHORTS']);
    expect(result.stance).toBe('NEUTRAL');
    expect(result.note).toBe('Trade z-score entries as normal');
  });

  it('returns NEUTRAL for empty signals array', () => {
    const result = computeStance([]);
    expect(result.stance).toBe('NEUTRAL');
    expect(result.note).toBe('Trade z-score entries as normal');
  });

  it('returns CAUTION for a single CAUTION signal', () => {
    const result = computeStance(['CAUTION']);
    expect(result.stance).toBe('CAUTION');
    expect(result.note).toBe('Risk-off signal active — reduce size');
  });

  it('counts BULLISH as a long signal', () => {
    const result = computeStance(['BULLISH', 'AVOID_SHORTS']);
    expect(result.stance).toBe('FAVOUR LONGS');
  });

  it('counts BEARISH as a short signal', () => {
    const result = computeStance(['BEARISH', 'AVOID_LONGS']);
    expect(result.stance).toBe('FAVOUR SHORTS');
  });
});
