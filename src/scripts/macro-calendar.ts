import axios from 'axios';
import { z } from 'zod';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);

// --- Zod schema (loose, passthrough to avoid breaking on extra fields) ---

const MacroEventRawSchema = z.object({
  title: z.string(),
  country: z.string(),
  date: z.string(),
  impact: z.string(),
  forecast: z.string().optional(),
  previous: z.string().optional(),
}).passthrough();

const CalendarResponseSchema = z.array(MacroEventRawSchema);

// --- Output types ---

export interface MacroEvent {
  title: string;
  country: string;
  datetime: Date;
  datetimeLocal: string;   // "HH:mm UTC"
  impact: 'High' | 'Medium' | 'Low' | 'Non-Economic';
  forecast: string;
  previous: string;
  minutesUntil: number;
}

export interface MacroCalendarResult {
  today: MacroEvent[];
  highImpact: MacroEvent[];
  hasHighImpactToday: boolean;
  nextHighImpact: MacroEvent | null;
  signal: 'CAUTION' | 'CLEAR';
  summary: string;
}

// --- Helpers ---

const CALENDAR_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

function makeFallback(): MacroCalendarResult {
  return {
    today: [],
    highImpact: [],
    hasHighImpactToday: false,
    nextHighImpact: null,
    signal: 'CLEAR',
    summary: '⚠️ Calendar unavailable — check manually',
  };
}

function formatUtcTime(date: dayjs.Dayjs): string {
  return `${date.utc().format('HH:mm')} UTC`;
}

function parseImpact(raw: string): MacroEvent['impact'] {
  if (raw === 'High') return 'High';
  if (raw === 'Medium') return 'Medium';
  if (raw === 'Low') return 'Low';
  return 'Non-Economic';
}

function buildSummary(highImpact: MacroEvent[]): string {
  if (highImpact.length === 0) {
    return '📅 Macro: ✅ No high-impact USD events today — clear to trade';
  }
  const eventParts = highImpact
    .map((e) => `${e.title} @ ${e.datetimeLocal}`)
    .join(', ');
  return `📅 Macro: ⚠️ HIGH IMPACT — ${eventParts} — Reduce size near these windows`;
}

// --- Main exported function ---

export async function getMacroCalendar(): Promise<MacroCalendarResult> {
  try {
    const response = await axios.get(CALENDAR_URL, { timeout: 10_000 });

    const parsed = CalendarResponseSchema.safeParse(response.data);
    if (!parsed.success) {
      console.error('[macro-calendar] Invalid API response:', parsed.error.message);
      return makeFallback();
    }

    const now = dayjs();
    const todayUtc = now.utc().format('YYYY-MM-DD');

    const todayEvents: MacroEvent[] = [];

    for (const raw of parsed.data) {
      const eventDay = dayjs(raw.date).utc();
      if (eventDay.format('YYYY-MM-DD') !== todayUtc) continue;

      const minutesUntil = Math.round(eventDay.diff(now, 'minute', true));

      todayEvents.push({
        title: raw.title,
        country: raw.country,
        datetime: eventDay.toDate(),
        datetimeLocal: formatUtcTime(eventDay),
        impact: parseImpact(raw.impact),
        forecast: raw.forecast ?? '',
        previous: raw.previous ?? '',
        minutesUntil,
      });
    }

    const highImpact = todayEvents.filter(
      (e) => e.impact === 'High' && e.country === 'USD'
    );

    const futureHigh = highImpact
      .filter((e) => e.minutesUntil > 0)
      .sort((a, b) => a.minutesUntil - b.minutesUntil);

    const nextHighImpact = futureHigh.length > 0 ? futureHigh[0] : null;

    return {
      today: todayEvents,
      highImpact,
      hasHighImpactToday: highImpact.length > 0,
      nextHighImpact,
      signal: highImpact.length > 0 ? 'CAUTION' : 'CLEAR',
      summary: buildSummary(highImpact),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[macro-calendar] Failed to fetch data:', message);
    return makeFallback();
  }
}

// --- Standalone execution ---

const isMain = process.argv[1] != null &&
  (process.argv[1].endsWith('/macro-calendar.ts') || process.argv[1].endsWith('/macro-calendar.js'));

if (isMain) {
  getMacroCalendar().then((result) => {
    console.log(result.summary);
  });
}
