import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { getLSRatio } from '../scripts/ls-ratio.js';
import type { LSRatioResult } from '../scripts/ls-ratio.js';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

const mockedGet = vi.mocked(axios.get);

// --- Test data helpers ---

function makeBybitResponse(buyRatio: string, sellRatio: string, timestamp = '1742000000000') {
  return {
    data: {
      result: {
        list: [
          {
            symbol: 'SOLUSDT',
            buyRatio,
            sellRatio,
            timestamp,
          },
        ],
      },
    },
  };
}

function makeBinanceResponse(longAccount: string, shortAccount: string, timestamp = 1742000000000) {
  const longNum = Number(longAccount);
  const shortNum = Number(shortAccount);
  const ratio = shortNum === 0 ? '0' : (longNum / shortNum).toFixed(4);
  return {
    data: [
      {
        symbol: 'SOLUSDT',
        longShortRatio: ratio,
        longAccount,
        shortAccount,
        timestamp,
      },
    ],
  };
}

/**
 * Helper to convert a percentage (e.g. 65.23) to a 0-1 fraction string (e.g. "0.6523").
 */
function pctToFraction(pct: number): string {
  return (pct / 100).toFixed(4);
}

/**
 * Set up both exchanges to return given long percentages.
 */
function setupBothExchanges(bybitLongPct: number, binanceLongPct: number) {
  const bybitBuy = pctToFraction(bybitLongPct);
  const bybitSell = pctToFraction(100 - bybitLongPct);
  const binanceLong = pctToFraction(binanceLongPct);
  const binanceShort = pctToFraction(100 - binanceLongPct);

  mockedGet.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('api.bybit.com/v5/market/account-ratio')) {
      return Promise.resolve(makeBybitResponse(bybitBuy, bybitSell));
    }
    if (typeof url === 'string' && url.includes('fapi.binance.com/futures/data/globalLongShortAccountRatio')) {
      return Promise.resolve(makeBinanceResponse(binanceLong, binanceShort));
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
}

function setupBybitOnly(longPct: number) {
  const bybitBuy = pctToFraction(longPct);
  const bybitSell = pctToFraction(100 - longPct);

  mockedGet.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('api.bybit.com/v5/market/account-ratio')) {
      return Promise.resolve(makeBybitResponse(bybitBuy, bybitSell));
    }
    if (typeof url === 'string' && url.includes('fapi.binance.com')) {
      return Promise.reject(new Error('Binance network error'));
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
}

function setupBinanceOnly(longPct: number) {
  const binanceLong = pctToFraction(longPct);
  const binanceShort = pctToFraction(100 - longPct);

  mockedGet.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('fapi.binance.com/futures/data/globalLongShortAccountRatio')) {
      return Promise.resolve(makeBinanceResponse(binanceLong, binanceShort));
    }
    if (typeof url === 'string' && url.includes('api.bybit.com')) {
      return Promise.reject(new Error('Bybit network error'));
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('getLSRatio', () => {
  // 1. Both exchanges succeed: correct LSRatioResult
  it('should return LSRatioResult with correct fields when both exchanges succeed', async () => {
    setupBothExchanges(55, 55);

    const result = await getLSRatio();

    expect(result).not.toBeNull();
    const r = result as LSRatioResult;
    expect(r.bybit).not.toBeNull();
    expect(r.binance).not.toBeNull();
    expect(r.bybit!.longPct).toBeCloseTo(55, 0);
    expect(r.bybit!.shortPct).toBeCloseTo(45, 0);
    expect(r.binance!.longPct).toBeCloseTo(55, 0);
    expect(r.binance!.shortPct).toBeCloseTo(45, 0);
    expect(r.average.longPct).toBeCloseTo(55, 0);
    expect(r.average.shortPct).toBeCloseTo(45, 0);
    expect(r.signal).toBeDefined();
    expect(r.emoji).toBeDefined();
    expect(r.summary).toBeDefined();
    expect(r.bybit!.timestamp).toBeInstanceOf(Date);
    expect(r.binance!.timestamp).toBeInstanceOf(Date);
  });

  // 2. Signal CROWDED_LONG: avg longPct 67 → CROWDED_LONG
  it('should return CROWDED_LONG signal when average longPct is 67', async () => {
    setupBothExchanges(67, 67);

    const result = await getLSRatio();

    expect(result).not.toBeNull();
    const r = result as LSRatioResult;
    expect(r.signal).toBe('CROWDED_LONG');
    expect(r.emoji).toBe('\u{1F534}');
  });

  // 3. Signal CROWDED_SHORT: avg longPct 32 → CROWDED_SHORT
  it('should return CROWDED_SHORT signal when average longPct is 32', async () => {
    setupBothExchanges(32, 32);

    const result = await getLSRatio();

    expect(result).not.toBeNull();
    const r = result as LSRatioResult;
    expect(r.signal).toBe('CROWDED_SHORT');
    expect(r.emoji).toBe('\u{1F7E2}');
  });

  // 4. Signal NEUTRAL: avg longPct 50 → NEUTRAL
  it('should return NEUTRAL signal when average longPct is 50', async () => {
    setupBothExchanges(50, 50);

    const result = await getLSRatio();

    expect(result).not.toBeNull();
    const r = result as LSRatioResult;
    expect(r.signal).toBe('NEUTRAL');
    expect(r.emoji).toBe('\u{26AA}');
  });

  // 5. Boundary: longPct exactly 65 → NEUTRAL (strict >)
  it('should return NEUTRAL when average longPct is exactly 65 (boundary, strict >)', async () => {
    setupBothExchanges(65, 65);

    const result = await getLSRatio();

    expect(result).not.toBeNull();
    const r = result as LSRatioResult;
    expect(r.average.longPct).toBeCloseTo(65, 0);
    expect(r.signal).toBe('NEUTRAL');
  });

  // 6. Boundary: longPct exactly 35 → NEUTRAL (strict <)
  it('should return NEUTRAL when average longPct is exactly 35 (boundary, strict <)', async () => {
    setupBothExchanges(35, 35);

    const result = await getLSRatio();

    expect(result).not.toBeNull();
    const r = result as LSRatioResult;
    expect(r.average.longPct).toBeCloseTo(35, 0);
    expect(r.signal).toBe('NEUTRAL');
  });

  // 7. Just above boundary: 65.1 → CROWDED_LONG
  it('should return CROWDED_LONG when average longPct is 65.1 (just above boundary)', async () => {
    setupBothExchanges(65.1, 65.1);

    const result = await getLSRatio();

    expect(result).not.toBeNull();
    const r = result as LSRatioResult;
    expect(r.average.longPct).toBeCloseTo(65.1, 0);
    expect(r.signal).toBe('CROWDED_LONG');
  });

  // 8. Just below boundary: 34.9 → CROWDED_SHORT
  it('should return CROWDED_SHORT when average longPct is 34.9 (just below boundary)', async () => {
    setupBothExchanges(34.9, 34.9);

    const result = await getLSRatio();

    expect(result).not.toBeNull();
    const r = result as LSRatioResult;
    expect(r.average.longPct).toBeCloseTo(34.9, 0);
    expect(r.signal).toBe('CROWDED_SHORT');
  });

  // 9. Bybit fails, Binance succeeds: bybit null, average = Binance values
  it('should return result with null bybit when Bybit fails but Binance succeeds', async () => {
    setupBinanceOnly(60);

    const result = await getLSRatio();

    expect(result).not.toBeNull();
    const r = result as LSRatioResult;
    expect(r.bybit).toBeNull();
    expect(r.binance).not.toBeNull();
    expect(r.average.longPct).toBeCloseTo(60, 0);
    expect(r.average.shortPct).toBeCloseTo(40, 0);
  });

  // 10. Binance fails, Bybit succeeds: binance null, average = Bybit values
  it('should return result with null binance when Binance fails but Bybit succeeds', async () => {
    setupBybitOnly(60);

    const result = await getLSRatio();

    expect(result).not.toBeNull();
    const r = result as LSRatioResult;
    expect(r.binance).toBeNull();
    expect(r.bybit).not.toBeNull();
    expect(r.average.longPct).toBeCloseTo(60, 0);
    expect(r.average.shortPct).toBeCloseTo(40, 0);
  });

  // 11. Both fail → null
  it('should return null when both exchanges fail', async () => {
    mockedGet.mockRejectedValue(new Error('Network Error'));

    const result = await getLSRatio();

    expect(result).toBeNull();
  });

  // 12. Bybit buyRatio 0-1 fraction correctly converted to percentage (0.6523 → 65.23)
  it('should convert Bybit buyRatio from 0-1 fraction to percentage', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('api.bybit.com/v5/market/account-ratio')) {
        return Promise.resolve(makeBybitResponse('0.6523', '0.3477'));
      }
      if (typeof url === 'string' && url.includes('fapi.binance.com')) {
        return Promise.reject(new Error('Binance unavailable'));
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    const result = await getLSRatio();

    expect(result).not.toBeNull();
    const r = result as LSRatioResult;
    expect(r.bybit).not.toBeNull();
    expect(r.bybit!.longPct).toBeCloseTo(65.23, 2);
    expect(r.bybit!.shortPct).toBeCloseTo(34.77, 2);
  });

  // 13. Binance longAccount 0-1 fraction correctly converted to percentage
  it('should convert Binance longAccount from 0-1 fraction to percentage', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('fapi.binance.com/futures/data/globalLongShortAccountRatio')) {
        return Promise.resolve(makeBinanceResponse('0.6523', '0.3477'));
      }
      if (typeof url === 'string' && url.includes('api.bybit.com')) {
        return Promise.reject(new Error('Bybit unavailable'));
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    const result = await getLSRatio();

    expect(result).not.toBeNull();
    const r = result as LSRatioResult;
    expect(r.binance).not.toBeNull();
    expect(r.binance!.longPct).toBeCloseTo(65.23, 2);
    expect(r.binance!.shortPct).toBeCloseTo(34.77, 2);
  });

  // 14. Zod validation failure → treats as exchange failure
  it('should treat Bybit as failed when Zod validation fails on its response', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('api.bybit.com/v5/market/account-ratio')) {
        // Return invalid response (empty list — min(1) fails)
        return Promise.resolve({ data: { result: { list: [] } } });
      }
      if (typeof url === 'string' && url.includes('fapi.binance.com/futures/data/globalLongShortAccountRatio')) {
        return Promise.resolve(makeBinanceResponse('0.5000', '0.5000'));
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    const result = await getLSRatio();

    expect(result).not.toBeNull();
    const r = result as LSRatioResult;
    expect(r.bybit).toBeNull();
    expect(r.binance).not.toBeNull();
  });
});
