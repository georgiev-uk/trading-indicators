import dayjs from 'dayjs';
import { getFearGreed } from './fear-greed.js';
import { getFundingRate } from './funding-rate.js';
import { getLSRatio } from './ls-ratio.js';
import { getMacroCalendar } from './macro-calendar.js';
import { getBTCDominance } from './btc-dominance.js';
import { getSolTVL } from './sol-tvl.js';
import { getCryptoPanic } from './cryptopanic.js';

// --- Types ---

export type Signal =
  | 'AVOID_LONGS'
  | 'AVOID_SHORTS'
  | 'CROWDED_LONG'
  | 'CROWDED_SHORT'
  | 'RISK_OFF'
  | 'RISK_ON'
  | 'CAUTION'
  | 'NEUTRAL'
  | 'HEALTHY'
  | 'CLEAR'
  | 'BULLISH'
  | 'BEARISH';

// --- Stance logic ---

export function computeStance(signals: Signal[]): { stance: string; note: string } {
  const shortSignals = signals.filter(
    (s) => s === 'AVOID_LONGS' || s === 'CROWDED_LONG' || s === 'BEARISH',
  ).length;

  const longSignals = signals.filter(
    (s) => s === 'AVOID_SHORTS' || s === 'CROWDED_SHORT' || s === 'RISK_ON' || s === 'BULLISH',
  ).length;

  const cautionSignals = signals.filter(
    (s) => s === 'CAUTION' || s === 'RISK_OFF',
  ).length;

  if (shortSignals >= 2) return { stance: 'FAVOUR SHORTS', note: `${shortSignals}/3 signals aligned short` };
  if (longSignals >= 2) return { stance: 'FAVOUR LONGS', note: `${longSignals}/3 signals aligned long` };
  if (cautionSignals >= 1) return { stance: 'CAUTION', note: 'Risk-off signal active — reduce size' };
  return { stance: 'NEUTRAL', note: 'No strong signals today.' };
}

// --- Stance footer ---

function stanceFooter(stance: string): string {
  switch (stance) {
    case 'FAVOUR SHORTS':
      return 'Wait for z-score > 1.5 entry. Size up to 150% of normal.';
    case 'FAVOUR LONGS':
      return 'Wait for z-score < -1.5 entry. Size up to 150% of normal.';
    case 'CAUTION':
      return 'Risk-off environment — reduce position sizing to 50%.';
    default:
      return 'Trade z-score entries as normal.\nUse standard 1–2% position sizing.';
  }
}

// --- Main briefing function ---

export async function runMorningBriefing(): Promise<string> {
  const results = await Promise.allSettled([
    getFearGreed(),
    getFundingRate(),
    getLSRatio(),
    getMacroCalendar(),
    getBTCDominance(),
    getSolTVL(),
    getCryptoPanic(),
  ]);

  const labels = ['Sentiment', 'Funding', 'L/S', 'Macro', 'BTC.D', 'TVL', 'News'];

  const signals: Signal[] = [];
  const sections: string[] = [];
  let allFailed = true;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const label = labels[i];

    if (result.status === 'rejected' || result.value === null || result.value === undefined) {
      sections.push(`⚠️ ${label} unavailable`);
      continue;
    }

    allFailed = false;
    const data = result.value;
    sections.push(data.summary);

    if ('signal' in data && typeof data.signal === 'string') {
      signals.push(data.signal as Signal);
    }
  }

  if (allFailed) {
    return '⚠️ Morning briefing failed — all data sources unavailable';
  }

  const dateHeader = dayjs().format('ddd D MMM YYYY');
  const { stance, note } = computeStance(signals);
  const footer = stanceFooter(stance);

  const lines = [
    `🌅 *Morning Briefing — ${dateHeader}*`,
    '',
    ...sections,
    '',
    '---',
    `🎯 *Trading Stance: ${stance}*`,
    note,
    footer,
  ];

  return lines.join('\n');
}

// --- Standalone execution ---

const isMain =
  process.argv[1] != null &&
  (process.argv[1].endsWith('/morning-briefing.ts') ||
   process.argv[1].endsWith('/morning-briefing.js'));

if (isMain) {
  console.log(await runMorningBriefing());
}
