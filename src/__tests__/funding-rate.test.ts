import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { getFundingRate } from '../scripts/funding-rate.js';
import type { FundingRateResult } from '../scripts/funding-rate.js';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

const mockedGet = vi.mocked(axios.get);

// --- Test data helpers ---

function makeBinanceFundingResponse(rate: string, markPrice = '120.50') {
  return {
    data: [
      {
        symbol: 'SOLUSDT',
        fundingRate: rate,
        fundingTime: 1742000000000,
        markPrice,
      },
    ],
  };
}

function makeBinancePremiumResponse(lastFundingRate: string, markPrice = '120.50') {
  return {
    data: {
      symbol: 'SOLUSDT',
      markPrice,
      nextFundingTime: 1742008000000,
      lastFundingRate,
    },
  };
}

function makeBybitHistoryResponse(rate: string) {
  return {
    data: {
      result: {
        list: [
          {
            symbol: 'SOLUSDT',
            fundingRate: rate,
            fundingRateTimestamp: '1742000000000',
          },
        ],
      },
    },
  };
}

function makeBybitTickerResponse(rate: string, lastPrice = '120.45') {
  return {
    data: {
      result: {
        list: [
          {
            symbol: 'SOLUSDT',
            fundingRate: rate,
            nextFundingTime: '1742008000000',
            lastPrice,
          },
        ],
      },
    },
  };
}

/**
 * Set up mockedGet to return the right response for each URL.
 * Binance funding rate, Binance premium index, Bybit history, Bybit ticker.
 */
function setupBothExchanges(binanceRate: string, bybitRate: string) {
  mockedGet.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('fapi.binance.com/fapi/v1/fundingRate')) {
      return Promise.resolve(makeBinanceFundingResponse(binanceRate));
    }
    if (typeof url === 'string' && url.includes('fapi.binance.com/fapi/v1/premiumIndex')) {
      return Promise.resolve(makeBinancePremiumResponse(binanceRate));
    }
    if (typeof url === 'string' && url.includes('api.bybit.com/v5/market/funding/history')) {
      return Promise.resolve(makeBybitHistoryResponse(bybitRate));
    }
    if (typeof url === 'string' && url.includes('api.bybit.com/v5/market/tickers')) {
      return Promise.resolve(makeBybitTickerResponse(bybitRate));
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
}

function setupBinanceOnly(rate: string) {
  mockedGet.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('fapi.binance.com/fapi/v1/fundingRate')) {
      return Promise.resolve(makeBinanceFundingResponse(rate));
    }
    if (typeof url === 'string' && url.includes('fapi.binance.com/fapi/v1/premiumIndex')) {
      return Promise.resolve(makeBinancePremiumResponse(rate));
    }
    if (typeof url === 'string' && url.includes('api.bybit.com')) {
      return Promise.reject(new Error('Bybit network error'));
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
}

function setupBybitOnly(rate: string) {
  mockedGet.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('fapi.binance.com')) {
      return Promise.reject(new Error('Binance network error'));
    }
    if (typeof url === 'string' && url.includes('api.bybit.com/v5/market/funding/history')) {
      return Promise.resolve(makeBybitHistoryResponse(rate));
    }
    if (typeof url === 'string' && url.includes('api.bybit.com/v5/market/tickers')) {
      return Promise.resolve(makeBybitTickerResponse(rate));
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('getFundingRate', () => {
  // 1. Both exchanges succeed
  it('should return FundingRateResult with correct fields when both exchanges succeed', async () => {
    setupBothExchanges('0.0001', '0.0001');

    const result = await getFundingRate();

    expect(result).not.toBeNull();
    const r = result as FundingRateResult;
    expect(r.binance).not.toBeNull();
    expect(r.bybit).not.toBeNull();
    expect(r.binance!.currentRate).toBe(0.0001);
    expect(r.bybit!.currentRate).toBe(0.0001);
    expect(r.solPrice).toBeGreaterThan(0);
    expect(r.average.currentRate).toBe(0.0001);
    expect(r.signal).toBeDefined();
    expect(r.emoji).toBeDefined();
    expect(r.summary).toBeDefined();
  });

  // 2. Signal CROWDED_LONG
  it('should return CROWDED_LONG signal when average rate is 0.0006', async () => {
    setupBothExchanges('0.0006', '0.0006');

    const result = await getFundingRate();

    expect(result).not.toBeNull();
    const r = result as FundingRateResult;
    expect(r.signal).toBe('CROWDED_LONG');
    expect(r.emoji).toBe('\u{1F534}'); // red circle
  });

  // 3. Signal CROWDED_SHORT
  it('should return CROWDED_SHORT signal when average rate is -0.0004', async () => {
    setupBothExchanges('-0.0004', '-0.0004');

    const result = await getFundingRate();

    expect(result).not.toBeNull();
    const r = result as FundingRateResult;
    expect(r.signal).toBe('CROWDED_SHORT');
    expect(r.emoji).toBe('\u{1F7E2}'); // green circle
  });

  // 4. Signal NEUTRAL
  it('should return NEUTRAL signal when average rate is 0.0001', async () => {
    setupBothExchanges('0.0001', '0.0001');

    const result = await getFundingRate();

    expect(result).not.toBeNull();
    const r = result as FundingRateResult;
    expect(r.signal).toBe('NEUTRAL');
    expect(r.emoji).toBe('\u{26AA}'); // white circle
  });

  // 5. Boundary test: rate exactly 0.0005 → NEUTRAL (strict inequality)
  it('should return NEUTRAL when average rate is exactly 0.0005 (boundary)', async () => {
    setupBothExchanges('0.0005', '0.0005');

    const result = await getFundingRate();

    expect(result).not.toBeNull();
    const r = result as FundingRateResult;
    expect(r.average.currentRate).toBeCloseTo(0.0005, 10);
    expect(r.signal).toBe('NEUTRAL');
  });

  // 6. Boundary test: rate exactly -0.0003 → NEUTRAL (strict inequality)
  it('should return NEUTRAL when average rate is exactly -0.0003 (boundary)', async () => {
    setupBothExchanges('-0.0003', '-0.0003');

    const result = await getFundingRate();

    expect(result).not.toBeNull();
    const r = result as FundingRateResult;
    expect(r.average.currentRate).toBeCloseTo(-0.0003, 10);
    expect(r.signal).toBe('NEUTRAL');
  });

  // 5b. Just above CROWDED_LONG threshold
  it('should return CROWDED_LONG when average rate is 0.0006 (above threshold)', async () => {
    setupBothExchanges('0.0006', '0.0006');

    const result = await getFundingRate();

    expect(result).not.toBeNull();
    const r = result as FundingRateResult;
    expect(r.average.currentRate).toBeCloseTo(0.0006, 10);
    expect(r.signal).toBe('CROWDED_LONG');
  });

  // 6b. Just below CROWDED_SHORT threshold
  it('should return CROWDED_SHORT when average rate is -0.0004 (below threshold)', async () => {
    setupBothExchanges('-0.0004', '-0.0004');

    const result = await getFundingRate();

    expect(result).not.toBeNull();
    const r = result as FundingRateResult;
    expect(r.average.currentRate).toBeCloseTo(-0.0004, 10);
    expect(r.signal).toBe('CROWDED_SHORT');
  });

  // 7. Binance fails, Bybit succeeds
  it('should return result with null binance when Binance fails but Bybit succeeds', async () => {
    setupBybitOnly('0.0002');

    const result = await getFundingRate();

    expect(result).not.toBeNull();
    const r = result as FundingRateResult;
    expect(r.binance).toBeNull();
    expect(r.bybit).not.toBeNull();
    expect(r.average.currentRate).toBe(0.0002);
    expect(r.summary).toContain('partial data');
  });

  // 8. Bybit fails, Binance succeeds
  it('should return result with null bybit when Bybit fails but Binance succeeds', async () => {
    setupBinanceOnly('0.0002');

    const result = await getFundingRate();

    expect(result).not.toBeNull();
    const r = result as FundingRateResult;
    expect(r.binance).not.toBeNull();
    expect(r.bybit).toBeNull();
    expect(r.average.currentRate).toBe(0.0002);
    expect(r.summary).toContain('partial data');
  });

  // 9. Both fail → returns null
  it('should return null when both exchanges fail', async () => {
    mockedGet.mockRejectedValue(new Error('Network Error'));

    const result = await getFundingRate();

    expect(result).toBeNull();
  });

  // 10. Annualisation calculation
  it('should correctly calculate annualised rate as currentRate * 3 * 365', async () => {
    const rate = 0.0002;
    setupBothExchanges(String(rate), String(rate));

    const result = await getFundingRate();

    expect(result).not.toBeNull();
    const r = result as FundingRateResult;
    const expectedAnnualised = rate * 3 * 365;
    expect(r.binance!.annualised).toBeCloseTo(expectedAnnualised, 10);
    expect(r.bybit!.annualised).toBeCloseTo(expectedAnnualised, 10);
    expect(r.average.annualised).toBeCloseTo(expectedAnnualised, 10);
  });

  // 11. Zod validation failure on Binance response
  it('should treat Binance as failed when Zod validation fails on its response', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('fapi.binance.com/fapi/v1/fundingRate')) {
        // Return invalid response (empty array — min(1) fails)
        return Promise.resolve({ data: [] });
      }
      if (typeof url === 'string' && url.includes('fapi.binance.com/fapi/v1/premiumIndex')) {
        return Promise.resolve(makeBinancePremiumResponse('0.0001'));
      }
      if (typeof url === 'string' && url.includes('api.bybit.com/v5/market/funding/history')) {
        return Promise.resolve(makeBybitHistoryResponse('0.0001'));
      }
      if (typeof url === 'string' && url.includes('api.bybit.com/v5/market/tickers')) {
        return Promise.resolve(makeBybitTickerResponse('0.0001'));
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    const result = await getFundingRate();

    expect(result).not.toBeNull();
    const r = result as FundingRateResult;
    expect(r.binance).toBeNull();
    expect(r.bybit).not.toBeNull();
  });

  // 12. Summary string contains rate percentage and signal
  it('should produce a summary containing the rate percentage and signal text', async () => {
    setupBothExchanges('0.0006', '0.0006');

    const result = await getFundingRate();

    expect(result).not.toBeNull();
    const r = result as FundingRateResult;
    expect(r.summary).toContain('SOL Funding');
    expect(r.summary).toContain('/8h');
    expect(r.summary).toContain('ann.');
    expect(r.summary).toContain('Crowded LONG');
  });
});
