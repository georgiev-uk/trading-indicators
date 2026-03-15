import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { getFearGreed } from '../scripts/fear-greed.js';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

const mockedGet = vi.mocked(axios.get);

function makeApiResponse(
  data: Array<{ value: string; value_classification: string; timestamp: string; time_until_update?: string }>
) {
  return {
    data: {
      name: 'Fear and Greed Index',
      data,
    },
  };
}

function makeItem(value: string, classification: string, timestamp: string) {
  return { value, value_classification: classification, timestamp, time_until_update: '54321' };
}

// 7 days of sample data
const sevenDayData = [
  makeItem('42', 'Fear', '1742000000'),
  makeItem('38', 'Fear', '1741913600'),
  makeItem('45', 'Fear', '1741827200'),
  makeItem('50', 'Neutral', '1741740800'),
  makeItem('55', 'Greed', '1741654400'),
  makeItem('60', 'Greed', '1741568000'),
  makeItem('30', 'Fear', '1741481600'),
];

beforeEach(() => {
  vi.resetAllMocks();
});

describe('getFearGreed', () => {
  it('should return FearGreedResult with value 42 and signal NEUTRAL on happy path', async () => {
    mockedGet.mockResolvedValue(makeApiResponse([makeItem('42', 'Fear', '1742000000')]));

    const result = await getFearGreed();

    expect(result).not.toBeNull();
    expect(result!.current.value).toBe(42);
    expect(result!.current.classification).toBe('Fear');
    expect(result!.signal).toBe('NEUTRAL');
  });

  it('should return AVOID_SHORTS and emoji 😨 for value 18 (Extreme Fear)', async () => {
    mockedGet.mockResolvedValue(makeApiResponse([makeItem('18', 'Extreme Fear', '1742000000')]));

    const result = await getFearGreed();

    expect(result).not.toBeNull();
    expect(result!.signal).toBe('AVOID_SHORTS');
    expect(result!.emoji).toBe('😨');
  });

  it('should return AVOID_LONGS and emoji 🤑 for value 85 (Extreme Greed)', async () => {
    mockedGet.mockResolvedValue(makeApiResponse([makeItem('85', 'Extreme Greed', '1742000000')]));

    const result = await getFearGreed();

    expect(result).not.toBeNull();
    expect(result!.signal).toBe('AVOID_LONGS');
    expect(result!.emoji).toBe('🤑');
  });

  it('should return NEUTRAL and emoji 😐 for value 50', async () => {
    mockedGet.mockResolvedValue(makeApiResponse([makeItem('50', 'Neutral', '1742000000')]));

    const result = await getFearGreed();

    expect(result).not.toBeNull();
    expect(result!.signal).toBe('NEUTRAL');
    expect(result!.emoji).toBe('😐');
  });

  it('should parse all 7 items into the trend array', async () => {
    mockedGet.mockResolvedValue(makeApiResponse(sevenDayData));

    const result = await getFearGreed();

    expect(result).not.toBeNull();
    expect(result!.trend).toHaveLength(7);
    expect(result!.trend[0].value).toBe(42);
    expect(result!.trend[6].value).toBe(30);
    // Each trend item should have a YYYY-MM-DD date string
    for (const item of result!.trend) {
      expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // Verify a specific timestamp produces the expected date
    expect(result!.trend[0].date).toBe(new Date(1742000000 * 1000).toISOString().slice(0, 10));
  });

  it('should return null on network failure', async () => {
    mockedGet.mockRejectedValue(new Error('Network Error'));

    const result = await getFearGreed();

    expect(result).toBeNull();
  });

  it('should return null when response is missing data field (Zod validation fails)', async () => {
    mockedGet.mockResolvedValue({ data: { name: 'Fear and Greed Index' } });

    const result = await getFearGreed();

    expect(result).toBeNull();
  });

  it('should return null when value is not a numeric string', async () => {
    mockedGet.mockResolvedValue(
      makeApiResponse([makeItem('not-a-number', 'Unknown', '1742000000')])
    );

    const result = await getFearGreed();

    expect(result).toBeNull();
  });

  it('should produce a summary containing the value and classification', async () => {
    mockedGet.mockResolvedValue(makeApiResponse([makeItem('42', 'Fear', '1742000000')]));

    const result = await getFearGreed();

    expect(result).not.toBeNull();
    expect(result!.summary).toContain('42');
    expect(result!.summary).toContain('Fear');
    expect(result!.summary).toContain('NEUTRAL');
  });

  it('should correctly convert unix timestamp string to Date object', async () => {
    mockedGet.mockResolvedValue(makeApiResponse([makeItem('42', 'Fear', '1742000000')]));

    const result = await getFearGreed();

    expect(result).not.toBeNull();
    expect(result!.current.timestamp).toBeInstanceOf(Date);
    // 1742000000 * 1000 = 1742000000000
    expect(result!.current.timestamp.getTime()).toBe(1742000000 * 1000);
  });

  // Boundary tests for signal derivation
  it('should return AVOID_SHORTS for boundary value 24 (last in fear range)', async () => {
    mockedGet.mockResolvedValue(makeApiResponse([makeItem('24', 'Extreme Fear', '1742000000')]));

    const result = await getFearGreed();

    expect(result).not.toBeNull();
    expect(result!.signal).toBe('AVOID_SHORTS');
  });

  it('should return NEUTRAL for boundary value 25 (first in neutral range)', async () => {
    mockedGet.mockResolvedValue(makeApiResponse([makeItem('25', 'Fear', '1742000000')]));

    const result = await getFearGreed();

    expect(result).not.toBeNull();
    expect(result!.signal).toBe('NEUTRAL');
  });

  it('should return NEUTRAL for boundary value 75 (last in neutral range)', async () => {
    mockedGet.mockResolvedValue(makeApiResponse([makeItem('75', 'Greed', '1742000000')]));

    const result = await getFearGreed();

    expect(result).not.toBeNull();
    expect(result!.signal).toBe('NEUTRAL');
  });

  it('should return AVOID_LONGS for boundary value 76 (first in greed range)', async () => {
    mockedGet.mockResolvedValue(makeApiResponse([makeItem('76', 'Extreme Greed', '1742000000')]));

    const result = await getFearGreed();

    expect(result).not.toBeNull();
    expect(result!.signal).toBe('AVOID_LONGS');
  });
});
