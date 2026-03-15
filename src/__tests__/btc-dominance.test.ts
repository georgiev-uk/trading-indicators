import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios, { AxiosError } from 'axios';
import type { BTCDominanceResult } from '../scripts/btc-dominance.js';

vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios');
  return {
    default: {
      get: vi.fn(),
      isAxiosError: actual.default.isAxiosError,
    },
    AxiosError: actual.AxiosError,
  };
});

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const mockedGet = vi.mocked(axios.get);
const mockedReadFile = vi.mocked(readFile);
const mockedWriteFile = vi.mocked(writeFile);
const mockedMkdir = vi.mocked(mkdir);

function makeGlobalResponse(btc = 56.42, eth = 13.21, sol = 3.87) {
  return {
    data: {
      data: {
        market_cap_percentage: { btc, eth, sol },
        total_market_cap: { usd: 2450000000000 },
        total_volume: { usd: 98000000000 },
        market_cap_change_percentage_24h_usd: -1.23,
      },
    },
  };
}

function makeSolPriceResponse(usd = 120.45, change = 2.34) {
  return {
    data: {
      solana: { usd, usd_24h_change: change },
    },
  };
}

function makeCacheJson(btcDominance: number): string {
  return JSON.stringify({
    btcDominance,
    fetchedAt: '2026-03-14T07:30:00.000Z',
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockedMkdir.mockResolvedValue(undefined);
  mockedWriteFile.mockResolvedValue(undefined);
});

// Dynamic import to allow mocks to be set up first
async function callGetBTCDominance(): Promise<BTCDominanceResult | null> {
  const mod = await import('../scripts/btc-dominance.js');
  return mod.getBTCDominance();
}

describe('getBTCDominance', () => {
  it('should return result with btcDominance24hChange null when no cache exists', async () => {
    const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';
    mockedReadFile.mockRejectedValue(enoent);
    mockedGet
      .mockResolvedValueOnce(makeGlobalResponse())
      .mockResolvedValueOnce(makeSolPriceResponse());

    const result = await callGetBTCDominance();

    expect(result).not.toBeNull();
    expect(result!.btcDominance).toBe(56.42);
    expect(result!.btcDominance24hChange).toBeNull();
    expect(result!.signal).toBe('NEUTRAL');
  });

  it('should return RISK_OFF when dominance rises from 54.0 to 56.0 (+2.0)', async () => {
    mockedReadFile.mockResolvedValue(makeCacheJson(54.0));
    mockedGet
      .mockResolvedValueOnce(makeGlobalResponse(56.0))
      .mockResolvedValueOnce(makeSolPriceResponse());

    const result = await callGetBTCDominance();

    expect(result).not.toBeNull();
    expect(result!.btcDominance24hChange).toBe(2.0);
    expect(result!.signal).toBe('RISK_OFF');
    expect(result!.emoji).toBe('\u{1F534}');
  });

  it('should return RISK_ON when dominance drops from 60.0 to 58.0 (-2.0)', async () => {
    mockedReadFile.mockResolvedValue(makeCacheJson(60.0));
    mockedGet
      .mockResolvedValueOnce(makeGlobalResponse(58.0))
      .mockResolvedValueOnce(makeSolPriceResponse());

    const result = await callGetBTCDominance();

    expect(result).not.toBeNull();
    expect(result!.btcDominance24hChange).toBe(-2.0);
    expect(result!.signal).toBe('RISK_ON');
    expect(result!.emoji).toBe('\u{1F7E2}');
  });

  it('should return NEUTRAL when change is exactly +1.5 (strict >)', async () => {
    mockedReadFile.mockResolvedValue(makeCacheJson(54.92));
    mockedGet
      .mockResolvedValueOnce(makeGlobalResponse(56.42))
      .mockResolvedValueOnce(makeSolPriceResponse());

    const result = await callGetBTCDominance();

    expect(result).not.toBeNull();
    expect(result!.btcDominance24hChange).toBe(1.5);
    expect(result!.signal).toBe('NEUTRAL');
  });

  it('should return NEUTRAL when change is exactly -1.5 (strict <)', async () => {
    mockedReadFile.mockResolvedValue(makeCacheJson(57.92));
    mockedGet
      .mockResolvedValueOnce(makeGlobalResponse(56.42))
      .mockResolvedValueOnce(makeSolPriceResponse());

    const result = await callGetBTCDominance();

    expect(result).not.toBeNull();
    expect(result!.btcDominance24hChange).toBe(-1.5);
    expect(result!.signal).toBe('NEUTRAL');
  });

  it('should return RISK_OFF when change is +1.6', async () => {
    mockedReadFile.mockResolvedValue(makeCacheJson(54.82));
    mockedGet
      .mockResolvedValueOnce(makeGlobalResponse(56.42))
      .mockResolvedValueOnce(makeSolPriceResponse());

    const result = await callGetBTCDominance();

    expect(result).not.toBeNull();
    expect(result!.btcDominance24hChange).toBe(1.6);
    expect(result!.signal).toBe('RISK_OFF');
  });

  it('should return RISK_ON when change is -1.6', async () => {
    mockedReadFile.mockResolvedValue(makeCacheJson(58.02));
    mockedGet
      .mockResolvedValueOnce(makeGlobalResponse(56.42))
      .mockResolvedValueOnce(makeSolPriceResponse());

    const result = await callGetBTCDominance();

    expect(result).not.toBeNull();
    expect(result!.btcDominance24hChange).toBe(-1.6);
    expect(result!.signal).toBe('RISK_ON');
  });

  it('should treat ENOENT cache as no cache (btcDominance24hChange is null)', async () => {
    const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';
    mockedReadFile.mockRejectedValue(enoent);
    mockedGet
      .mockResolvedValueOnce(makeGlobalResponse())
      .mockResolvedValueOnce(makeSolPriceResponse());

    const result = await callGetBTCDominance();

    expect(result).not.toBeNull();
    expect(result!.btcDominance24hChange).toBeNull();
  });

  it('should return null when CoinGecko global endpoint fails', async () => {
    const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';
    mockedReadFile.mockRejectedValue(enoent);
    mockedGet
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce(makeSolPriceResponse());

    const result = await callGetBTCDominance();

    expect(result).toBeNull();
  });

  it('should return result with solPriceUsd=0 when SOL price endpoint fails', async () => {
    const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';
    mockedReadFile.mockRejectedValue(enoent);
    mockedGet
      .mockResolvedValueOnce(makeGlobalResponse())
      .mockRejectedValueOnce(new Error('SOL API down'));

    const result = await callGetBTCDominance();

    expect(result).not.toBeNull();
    expect(result!.solPriceUsd).toBe(0);
    expect(result!.sol24hChangePct).toBe(0);
  });

  it('should still return result when cache write fails (non-fatal)', async () => {
    const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';
    mockedReadFile.mockRejectedValue(enoent);
    mockedWriteFile.mockRejectedValue(new Error('Disk full'));
    mockedGet
      .mockResolvedValueOnce(makeGlobalResponse())
      .mockResolvedValueOnce(makeSolPriceResponse());

    const result = await callGetBTCDominance();

    expect(result).not.toBeNull();
    expect(result!.btcDominance).toBe(56.42);
  });

  it('should write new cache after successful fetch', async () => {
    const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';
    mockedReadFile.mockRejectedValue(enoent);
    mockedGet
      .mockResolvedValueOnce(makeGlobalResponse(56.42))
      .mockResolvedValueOnce(makeSolPriceResponse());

    await callGetBTCDominance();

    expect(mockedWriteFile).toHaveBeenCalledOnce();
    const writtenContent = mockedWriteFile.mock.calls[0][1] as string;
    const parsed = JSON.parse(writtenContent);
    expect(parsed.btcDominance).toBe(56.42);
    expect(parsed.fetchedAt).toBeDefined();
  });

  it('should include current btcDominance value in summary', async () => {
    const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';
    mockedReadFile.mockRejectedValue(enoent);
    mockedGet
      .mockResolvedValueOnce(makeGlobalResponse(58.4))
      .mockResolvedValueOnce(makeSolPriceResponse());

    const result = await callGetBTCDominance();

    expect(result).not.toBeNull();
    expect(result!.summary).toContain('58.4');
  });

  it('should include "RISK ON" in summary when signal is RISK_ON', async () => {
    mockedReadFile.mockResolvedValue(makeCacheJson(60.0));
    mockedGet
      .mockResolvedValueOnce(makeGlobalResponse(58.0))
      .mockResolvedValueOnce(makeSolPriceResponse());

    const result = await callGetBTCDominance();

    expect(result).not.toBeNull();
    expect(result!.signal).toBe('RISK_ON');
    expect(result!.summary).toContain('RISK ON');
  });

  it('should include "RISK OFF" in summary when signal is RISK_OFF', async () => {
    mockedReadFile.mockResolvedValue(makeCacheJson(54.0));
    mockedGet
      .mockResolvedValueOnce(makeGlobalResponse(56.0))
      .mockResolvedValueOnce(makeSolPriceResponse());

    const result = await callGetBTCDominance();

    expect(result).not.toBeNull();
    expect(result!.signal).toBe('RISK_OFF');
    expect(result!.summary).toContain('RISK OFF');
  });

  it('should retry once on 429 and succeed', async () => {
    vi.useFakeTimers();
    const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';
    mockedReadFile.mockRejectedValue(enoent);

    const rateLimitError = new AxiosError('Rate limited', '429', undefined, undefined, {
      status: 429,
      statusText: 'Too Many Requests',
      headers: {},
      config: {} as any,
      data: {},
    });

    mockedGet
      .mockRejectedValueOnce(rateLimitError) // global 429
      .mockResolvedValueOnce(makeSolPriceResponse()) // sol ok
      .mockResolvedValueOnce(makeGlobalResponse()); // global retry ok

    const promise = callGetBTCDominance();
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(result).not.toBeNull();
    expect(result!.btcDominance).toBe(56.42);
    expect(mockedGet).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('should return null when 429 retry also fails', async () => {
    vi.useFakeTimers();
    const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';
    mockedReadFile.mockRejectedValue(enoent);

    const rateLimitError = new AxiosError('Rate limited', '429', undefined, undefined, {
      status: 429,
      statusText: 'Too Many Requests',
      headers: {},
      config: {} as any,
      data: {},
    });

    mockedGet
      .mockRejectedValueOnce(rateLimitError) // global 429
      .mockResolvedValueOnce(makeSolPriceResponse()) // sol ok
      .mockRejectedValueOnce(new Error('Still failing')); // global retry fails

    const promise = callGetBTCDominance();
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(result).toBeNull();
    vi.useRealTimers();
  });
});
