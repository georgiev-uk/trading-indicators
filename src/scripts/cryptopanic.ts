import 'dotenv/config';
import axios from 'axios';
import { z } from 'zod';

// --- Zod schema for the CryptoPanic API response ---

const VotesSchema = z.object({
  negative: z.number(),
  positive: z.number(),
  important: z.number(),
}).passthrough();

const PostSchema = z.object({
  id: z.number(),
  title: z.string(),
  votes: VotesSchema,
}).passthrough();

const CryptoPanicApiResponseSchema = z.object({
  count: z.number(),
  results: z.array(PostSchema),
}).passthrough();

// --- Output types ---

export interface CryptoPanicResult {
  totalPosts: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  bullishRatio: number;
  topHeadlines: string[];
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  summary: string;
}

// --- Main exported function ---

const API_URL = 'https://cryptopanic.com/api/free/v2/posts/';

export async function getCryptoPanic(): Promise<CryptoPanicResult | null> {
  const apiKey = process.env.CRYPTOPANIC_API_KEY;
  if (!apiKey) {
    console.warn('[cryptopanic] CRYPTOPANIC_API_KEY not set — skipping');
    return null;
  }

  try {
    const response = await axios.get(API_URL, {
      timeout: 10_000,
      params: {
        auth_token: apiKey,
        currencies: 'BTC,SOL',
        kind: 'news',
        filter: 'rising',
        public: true,
      },
    });

    const parsed = CryptoPanicApiResponseSchema.safeParse(response.data);
    if (!parsed.success) {
      console.error('[cryptopanic] Invalid API response:', parsed.error.message);
      return null;
    }

    const posts = parsed.data.results;
    const totalPosts = posts.length;

    if (totalPosts === 0) {
      return {
        totalPosts: 0,
        bullishCount: 0,
        bearishCount: 0,
        neutralCount: 0,
        bullishRatio: 0,
        topHeadlines: [],
        signal: 'NEUTRAL',
        summary: '\u{1F4F0} News: No recent posts — neutral',
      };
    }

    let bullishCount = 0;
    let bearishCount = 0;
    let neutralCount = 0;

    for (const post of posts) {
      const { positive, negative } = post.votes;
      if (positive > negative) bullishCount++;
      else if (negative > positive) bearishCount++;
      else neutralCount++;
    }

    const bullishRatio = bullishCount / totalPosts;

    let signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    if (bullishRatio > 0.65) signal = 'BULLISH';
    else if (bullishRatio < 0.35) signal = 'BEARISH';
    else signal = 'NEUTRAL';

    // Top 3 headlines by total vote count (positive + negative + important)
    const sorted = [...posts].sort((a, b) => {
      const totalA = a.votes.positive + a.votes.negative + a.votes.important;
      const totalB = b.votes.positive + b.votes.negative + b.votes.important;
      return totalB - totalA;
    });
    const topHeadlines = sorted.slice(0, 3).map((p) => p.title);

    let mood: string;
    if (signal === 'BULLISH') mood = 'Positive momentum';
    else if (signal === 'BEARISH') mood = 'Negative news flow';
    else mood = 'Mixed sentiment';

    const summary = `\u{1F4F0} News: ${bullishCount}/${totalPosts} bullish \u2014 ${mood}`;

    return {
      totalPosts,
      bullishCount,
      bearishCount,
      neutralCount,
      bullishRatio,
      topHeadlines,
      signal,
      summary,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cryptopanic] Failed to fetch data:', message);
    return null;
  }
}

// --- Standalone execution ---

const isMain = process.argv[1] != null &&
  (process.argv[1].endsWith('/cryptopanic.ts') || process.argv[1].endsWith('/cryptopanic.js'));

if (isMain) {
  getCryptoPanic().then((result) => {
    if (result) console.log(result.summary);
    else console.error('Failed to fetch CryptoPanic data');
  });
}
