import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { getSolTVL } from '../scripts/sol-tvl.js';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

const mockedGet = vi.mocked(axios.get);

interface ChainEntry {
  name: string;
  tvl: number;
  change_1d: number | null;
  change_7d: number | null;
  change_1m: number | null;
  gecko_id?: string;
  tokenSymbol?: string;
}

function makeSolanaChain(overrides: Partial<ChainEntry> = {}): ChainEntry {
  return {
    name: 'Solana',
    tvl: 8_420_000_000,
    change_1d: 3.42,
    change_7d: -5.21,
    change_1m: 12.8,
    gecko_id: 'solana',
    tokenSymbol: 'SOL',
    ...overrides,
  };
}

function makeChainsResponse(chains: ChainEntry[]) {
  return { data: chains };
}

function makeDefaultResponse() {
  return makeChainsResponse([
    { name: 'Ethereum', tvl: 50_000_000_000, change_1d: 1.2, change_7d: 2.3, change_1m: 5.0 },
    makeSolanaChain(),
    { name: 'BSC', tvl: 5_000_000_000, change_1d: -0.5, change_7d: 1.1, change_1m: 3.0 },
  ]);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('getSolTVL', () => {
  it('should return correct SolTVLResult on happy path', async () => {
    mockedGet.mockResolvedValue(makeDefaultResponse());

    const result = await getSolTVL();

    expect(result).not.toBeNull();
    expect(result!.tvlUsd).toBe(8_420_000_000);
    expect(result!.tvlFormatted).toBe('$8.42B');
    expect(result!.change1d).toBe(3.42);
    expect(result!.change7d).toBe(-5.21);
    expect(result!.change1m).toBe(12.8);
    expect(result!.signal).toBe('HEALTHY');
    expect(result!.emoji).toBe('\u{1F7E2}');
  });

  it('should return CAUTION signal with emoji when change1d = -15', async () => {
    mockedGet.mockResolvedValue(makeChainsResponse([makeSolanaChain({ change_1d: -15 })]));

    const result = await getSolTVL();

    expect(result).not.toBeNull();
    expect(result!.signal).toBe('CAUTION');
    expect(result!.emoji).toBe('\u{1F6A8}');
  });

  it('should return HEALTHY signal with emoji when change1d = 5', async () => {
    mockedGet.mockResolvedValue(makeChainsResponse([makeSolanaChain({ change_1d: 5 })]));

    const result = await getSolTVL();

    expect(result).not.toBeNull();
    expect(result!.signal).toBe('HEALTHY');
    expect(result!.emoji).toBe('\u{1F7E2}');
  });

  it('should return NEUTRAL signal with emoji when change1d = 0', async () => {
    mockedGet.mockResolvedValue(makeChainsResponse([makeSolanaChain({ change_1d: 0 })]));

    const result = await getSolTVL();

    expect(result).not.toBeNull();
    expect(result!.signal).toBe('NEUTRAL');
    expect(result!.emoji).toBe('\u26AA');
  });

  it('should return NEUTRAL when change1d is exactly -10 (strict <)', async () => {
    mockedGet.mockResolvedValue(makeChainsResponse([makeSolanaChain({ change_1d: -10 })]));

    const result = await getSolTVL();

    expect(result).not.toBeNull();
    expect(result!.signal).toBe('NEUTRAL');
  });

  it('should return NEUTRAL when change1d is exactly 3 (strict >)', async () => {
    mockedGet.mockResolvedValue(makeChainsResponse([makeSolanaChain({ change_1d: 3 })]));

    const result = await getSolTVL();

    expect(result).not.toBeNull();
    expect(result!.signal).toBe('NEUTRAL');
  });

  it('should return CAUTION when change1d is -10.1 (just below -10)', async () => {
    mockedGet.mockResolvedValue(makeChainsResponse([makeSolanaChain({ change_1d: -10.1 })]));

    const result = await getSolTVL();

    expect(result).not.toBeNull();
    expect(result!.signal).toBe('CAUTION');
  });

  it('should return HEALTHY when change1d is 3.1 (just above 3)', async () => {
    mockedGet.mockResolvedValue(makeChainsResponse([makeSolanaChain({ change_1d: 3.1 })]));

    const result = await getSolTVL();

    expect(result).not.toBeNull();
    expect(result!.signal).toBe('HEALTHY');
  });

  it('should return null when Solana is not found in response', async () => {
    mockedGet.mockResolvedValue(makeChainsResponse([
      { name: 'Ethereum', tvl: 50_000_000_000, change_1d: 1.2, change_7d: 2.3, change_1m: 5.0 },
      { name: 'BSC', tvl: 5_000_000_000, change_1d: -0.5, change_7d: 1.1, change_1m: 3.0 },
    ]));

    const result = await getSolTVL();

    expect(result).toBeNull();
  });

  it('should return null on network failure', async () => {
    mockedGet.mockRejectedValue(new Error('Network Error'));

    const result = await getSolTVL();

    expect(result).toBeNull();
  });

  it('should format TVL of 8_420_000_000 as "$8.42B"', async () => {
    mockedGet.mockResolvedValue(makeChainsResponse([makeSolanaChain({ tvl: 8_420_000_000 })]));

    const result = await getSolTVL();

    expect(result).not.toBeNull();
    expect(result!.tvlFormatted).toBe('$8.42B');
  });

  it('should format TVL of 420_500_000 as "$420.50M"', async () => {
    mockedGet.mockResolvedValue(makeChainsResponse([makeSolanaChain({ tvl: 420_500_000 })]));

    const result = await getSolTVL();

    expect(result).not.toBeNull();
    expect(result!.tvlFormatted).toBe('$420.50M');
  });

  it('should return null on Zod validation failure', async () => {
    mockedGet.mockResolvedValue({ data: 'not an array' });

    const result = await getSolTVL();

    expect(result).toBeNull();
  });

  it('should produce a summary containing TVL formatted value and 24h change', async () => {
    mockedGet.mockResolvedValue(makeChainsResponse([makeSolanaChain({ tvl: 8_420_000_000, change_1d: 3.42 })]));

    const result = await getSolTVL();

    expect(result).not.toBeNull();
    expect(result!.summary).toContain('$8.42B');
    expect(result!.summary).toContain('+3.4%');
    expect(result!.summary).toContain('Solana TVL');
  });
});
