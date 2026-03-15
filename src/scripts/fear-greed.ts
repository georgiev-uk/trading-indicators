import axios from 'axios';
import { z } from 'zod';

// --- Zod schema for the Alternative.me API response ---

const FngDataItemSchema = z.object({
  value: z.string(),
  value_classification: z.string(),
  timestamp: z.string(),
  time_until_update: z.string().optional(),
});

const FngApiResponseSchema = z.object({
  name: z.string(),
  data: z.array(FngDataItemSchema).min(1),
});

// --- Output types ---

export interface FearGreedResult {
  current: {
    value: number;
    classification: string;
    timestamp: Date;
  };
  trend: Array<{
    value: number;
    classification: string;
    date: string; // "YYYY-MM-DD"
  }>;
  signal: 'AVOID_LONGS' | 'AVOID_SHORTS' | 'NEUTRAL';
  emoji: string;
  summary: string;
}

// --- Helpers ---

function deriveSignal(value: number): 'AVOID_LONGS' | 'AVOID_SHORTS' | 'NEUTRAL' {
  if (value <= 24) return 'AVOID_SHORTS';
  if (value >= 76) return 'AVOID_LONGS';
  return 'NEUTRAL';
}

function deriveEmoji(value: number): string {
  if (value <= 24) return '😨';
  if (value >= 76) return '🤑';
  return '😐';
}

function unixToDate(timestamp: string): Date {
  return new Date(Number(timestamp) * 1000);
}

function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// --- Main exported function ---

const API_URL = 'https://api.alternative.me/fng/?limit=7';

export async function getFearGreed(): Promise<FearGreedResult | null> {
  try {
    const response = await axios.get(API_URL, { timeout: 10_000 });

    const parsed = FngApiResponseSchema.safeParse(response.data);
    if (!parsed.success) {
      console.error('[fear-greed] Invalid API response:', parsed.error.message);
      return null;
    }

    const { data } = parsed.data;
    const latest = data[0];

    // Validate that value is numeric
    const numericValue = Number(latest.value);
    if (Number.isNaN(numericValue)) {
      console.error('[fear-greed] Value is not numeric:', latest.value);
      return null;
    }

    const signal = deriveSignal(numericValue);
    const emoji = deriveEmoji(numericValue);

    const trend = data.map((item) => {
      const val = Number(item.value);
      const date = unixToDate(item.timestamp);
      return {
        value: val,
        classification: item.value_classification,
        date: formatDate(date),
      };
    });

    const summary =
      `${emoji} Fear & Greed Index: ${numericValue} (${latest.value_classification}) — Signal: ${signal}`;

    return {
      current: {
        value: numericValue,
        classification: latest.value_classification,
        timestamp: unixToDate(latest.timestamp),
      },
      trend,
      signal,
      emoji,
      summary,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[fear-greed] Failed to fetch data:', message);
    return null;
  }
}

// --- Standalone execution ---

const isMain = process.argv[1] != null &&
  (process.argv[1].endsWith('/fear-greed.ts') || process.argv[1].endsWith('/fear-greed.js'));

if (isMain) {
  getFearGreed().then((result) => {
    if (result) console.log(result.summary);
    else console.error('Failed to fetch Fear & Greed data');
  });
}
