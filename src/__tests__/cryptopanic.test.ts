import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

const mockedGet = vi.mocked(axios.get);

// Import after mocking
const { getCryptoPanic } = await import('../scripts/cryptopanic.js');

// --- Helpers ---

interface PostVotes {
  positive: number;
  negative: number;
  important: number;
  liked?: number;
  disliked?: number;
}

function makePost(id: number, title: string, votes: PostVotes) {
  return {
    id,
    title,
    published_at: '2026-03-16T06:00:00Z',
    url: `https://example.com/${id}`,
    source: { title: 'CoinDesk', domain: 'coindesk.com' },
    currencies: [{ code: 'BTC', title: 'Bitcoin' }],
    votes: {
      negative: votes.negative,
      positive: votes.positive,
      important: votes.important,
      liked: votes.liked ?? 0,
      disliked: votes.disliked ?? 0,
      lol: 0,
      toxic: 0,
      saved: 0,
      comments: 0,
    },
    kind: 'news',
  };
}

function makeBullishPost(id: number, title = `Bullish headline ${id}`) {
  return makePost(id, title, { positive: 10, negative: 2, important: 5 });
}

function makeBearishPost(id: number, title = `Bearish headline ${id}`) {
  return makePost(id, title, { positive: 2, negative: 10, important: 5 });
}

function makeNeutralPost(id: number, title = `Neutral headline ${id}`) {
  return makePost(id, title, { positive: 5, negative: 5, important: 3 });
}

function makeApiResponse(posts: ReturnType<typeof makePost>[]) {
  return {
    data: {
      count: posts.length,
      next: null,
      previous: null,
      results: posts,
    },
  };
}

/**
 * Generate N posts with a given ratio of bullish posts.
 * Returns an array where the first `bullishCount` are bullish, rest are bearish.
 */
function generatePosts(total: number, bullishCount: number) {
  const posts = [];
  for (let i = 0; i < bullishCount; i++) {
    posts.push(makeBullishPost(i + 1));
  }
  for (let i = bullishCount; i < total; i++) {
    posts.push(makeBearishPost(i + 1));
  }
  return posts;
}

beforeEach(() => {
  vi.resetAllMocks();
  // Ensure CRYPTOPANIC_API_KEY is set for most tests
  process.env.CRYPTOPANIC_API_KEY = 'test-api-key';
});

describe('getCryptoPanic', () => {
  // 1. Returns null when API key missing
  it('returns null when CRYPTOPANIC_API_KEY is not set', async () => {
    delete process.env.CRYPTOPANIC_API_KEY;
    const result = await getCryptoPanic();
    expect(result).toBeNull();
  });

  // 2. Returns null on network error
  it('returns null on network error', async () => {
    mockedGet.mockRejectedValue(new Error('Network Error'));
    const result = await getCryptoPanic();
    expect(result).toBeNull();
  });

  // 3. Returns null on invalid Zod response
  it('returns null on invalid Zod response', async () => {
    mockedGet.mockResolvedValue({ data: { invalid: 'data' } });
    const result = await getCryptoPanic();
    expect(result).toBeNull();
  });

  // 4. BULLISH signal when >65% bullish posts (14/20)
  it('returns BULLISH signal when >65% bullish posts (14/20)', async () => {
    const posts = generatePosts(20, 14); // 14/20 = 70%
    mockedGet.mockResolvedValue(makeApiResponse(posts));

    const result = await getCryptoPanic();

    expect(result).not.toBeNull();
    expect(result!.signal).toBe('BULLISH');
    expect(result!.bullishRatio).toBe(0.7);
  });

  // 5. BEARISH signal when <35% bullish posts (6/20)
  it('returns BEARISH signal when <35% bullish posts (6/20)', async () => {
    const posts = generatePosts(20, 6); // 6/20 = 30%
    mockedGet.mockResolvedValue(makeApiResponse(posts));

    const result = await getCryptoPanic();

    expect(result).not.toBeNull();
    expect(result!.signal).toBe('BEARISH');
    expect(result!.bullishRatio).toBe(0.3);
  });

  // 6. NEUTRAL signal at exactly 65% (strict inequality — NOT BULLISH)
  it('returns NEUTRAL signal at exactly 65% boundary (strict >)', async () => {
    const posts = generatePosts(20, 13); // 13/20 = 0.65 exactly
    mockedGet.mockResolvedValue(makeApiResponse(posts));

    const result = await getCryptoPanic();

    expect(result).not.toBeNull();
    expect(result!.signal).toBe('NEUTRAL');
    expect(result!.bullishRatio).toBe(0.65);
  });

  // 7. NEUTRAL signal at exactly 35% (strict inequality — NOT BEARISH)
  it('returns NEUTRAL signal at exactly 35% boundary (strict <)', async () => {
    const posts = generatePosts(20, 7); // 7/20 = 0.35 exactly
    mockedGet.mockResolvedValue(makeApiResponse(posts));

    const result = await getCryptoPanic();

    expect(result).not.toBeNull();
    expect(result!.signal).toBe('NEUTRAL');
    expect(result!.bullishRatio).toBe(0.35);
  });

  // 8. BULLISH signal at 66% (just above threshold)
  it('returns BULLISH signal at 66% (just above threshold)', async () => {
    // 66/100 = 0.66, but let's use a smaller set: we need a ratio just > 0.65
    // Use 50 posts with 33 bullish = 0.66
    const posts = generatePosts(50, 33);
    mockedGet.mockResolvedValue(makeApiResponse(posts));

    const result = await getCryptoPanic();

    expect(result).not.toBeNull();
    expect(result!.signal).toBe('BULLISH');
    expect(result!.bullishRatio).toBe(0.66);
  });

  // 9. BEARISH signal at 34% (just below threshold)
  it('returns BEARISH signal at 34% (just below threshold)', async () => {
    // 17/50 = 0.34
    const posts = generatePosts(50, 17);
    mockedGet.mockResolvedValue(makeApiResponse(posts));

    const result = await getCryptoPanic();

    expect(result).not.toBeNull();
    expect(result!.signal).toBe('BEARISH');
    expect(result!.bullishRatio).toBe(0.34);
  });

  // 10. NEUTRAL with mixed results (50/50)
  it('returns NEUTRAL with 50/50 mixed results', async () => {
    const posts = generatePosts(20, 10); // 10/20 = 50%
    mockedGet.mockResolvedValue(makeApiResponse(posts));

    const result = await getCryptoPanic();

    expect(result).not.toBeNull();
    expect(result!.signal).toBe('NEUTRAL');
    expect(result!.bullishRatio).toBe(0.5);
  });

  // 11. Top 3 headlines returned (sorted by total votes)
  it('returns top 3 headlines sorted by total votes', async () => {
    const posts = [
      makePost(1, 'Low votes', { positive: 1, negative: 1, important: 1 }),    // total: 3
      makePost(2, 'Top headline', { positive: 20, negative: 5, important: 15 }), // total: 40
      makePost(3, 'Mid headline', { positive: 10, negative: 3, important: 7 }),  // total: 20
      makePost(4, 'Second headline', { positive: 15, negative: 5, important: 10 }), // total: 30
      makePost(5, 'Lowest votes', { positive: 0, negative: 0, important: 1 }),  // total: 1
    ];
    mockedGet.mockResolvedValue(makeApiResponse(posts));

    const result = await getCryptoPanic();

    expect(result).not.toBeNull();
    expect(result!.topHeadlines).toHaveLength(3);
    expect(result!.topHeadlines[0]).toBe('Top headline');
    expect(result!.topHeadlines[1]).toBe('Second headline');
    expect(result!.topHeadlines[2]).toBe('Mid headline');
  });

  // 12. Correct bullishCount/bearishCount/neutralCount
  it('correctly counts bullish, bearish, and neutral posts', async () => {
    const posts = [
      makeBullishPost(1),
      makeBullishPost(2),
      makeBullishPost(3),
      makeBearishPost(4),
      makeBearishPost(5),
      makeNeutralPost(6),
    ];
    mockedGet.mockResolvedValue(makeApiResponse(posts));

    const result = await getCryptoPanic();

    expect(result).not.toBeNull();
    expect(result!.bullishCount).toBe(3);
    expect(result!.bearishCount).toBe(2);
    expect(result!.neutralCount).toBe(1);
  });

  // 13. Handles posts where positive === negative (neutral post)
  it('classifies posts with equal positive and negative votes as neutral', async () => {
    const posts = [
      makeNeutralPost(1),
      makeNeutralPost(2),
      makeNeutralPost(3),
    ];
    mockedGet.mockResolvedValue(makeApiResponse(posts));

    const result = await getCryptoPanic();

    expect(result).not.toBeNull();
    expect(result!.bullishCount).toBe(0);
    expect(result!.bearishCount).toBe(0);
    expect(result!.neutralCount).toBe(3);
    expect(result!.signal).toBe('BEARISH'); // 0/3 = 0 bullishRatio < 0.35
  });

  // 14. Returns correct totalPosts count
  it('returns correct totalPosts count', async () => {
    const posts = generatePosts(15, 8);
    mockedGet.mockResolvedValue(makeApiResponse(posts));

    const result = await getCryptoPanic();

    expect(result).not.toBeNull();
    expect(result!.totalPosts).toBe(15);
  });

  // Additional: summary string format
  it('produces a summary containing bullish count and total', async () => {
    const posts = generatePosts(20, 14);
    mockedGet.mockResolvedValue(makeApiResponse(posts));

    const result = await getCryptoPanic();

    expect(result).not.toBeNull();
    expect(result!.summary).toContain('14/20 bullish');
    expect(result!.summary).toContain('Positive momentum');
  });
});
