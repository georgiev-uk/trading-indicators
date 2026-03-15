import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { getMacroCalendar } from '../scripts/macro-calendar.js';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

const mockedGet = vi.mocked(axios.get);

// Helper: create a ForexFactory-style event object
function makeEvent(overrides: {
  title?: string;
  country?: string;
  date?: string;
  impact?: string;
  forecast?: string;
  previous?: string;
} = {}) {
  return {
    title: overrides.title ?? 'CPI m/m',
    country: overrides.country ?? 'USD',
    date: overrides.date ?? '2026-03-15T13:30:00-0500',
    impact: overrides.impact ?? 'High',
    forecast: overrides.forecast ?? '0.3%',
    previous: overrides.previous ?? '0.4%',
  };
}

// The mocked "now" is 2026-03-15T12:00:00Z
// Events at -0500 offset: 13:30 -0500 = 18:30 UTC (same day, future)
// Events at -0500 offset: 03:00 -0500 = 08:00 UTC (same day, past)

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-15T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getMacroCalendar', () => {
  it('should return CAUTION signal for high-impact USD event today', async () => {
    mockedGet.mockResolvedValue({
      data: [makeEvent()],
    });

    const result = await getMacroCalendar();

    expect(result.signal).toBe('CAUTION');
    expect(result.highImpact).toHaveLength(1);
    expect(result.highImpact[0].title).toBe('CPI m/m');
  });

  it('should NOT include high-impact non-USD event in highImpact array', async () => {
    mockedGet.mockResolvedValue({
      data: [makeEvent({ country: 'EUR', title: 'ECB Rate Decision' })],
    });

    const result = await getMacroCalendar();

    expect(result.highImpact).toHaveLength(0);
    expect(result.today).toHaveLength(1);
    expect(result.today[0].title).toBe('ECB Rate Decision');
    expect(result.signal).toBe('CLEAR');
  });

  it('should NOT include low-impact USD event in highImpact array', async () => {
    mockedGet.mockResolvedValue({
      data: [makeEvent({ impact: 'Low', title: 'Some Low Event' })],
    });

    const result = await getMacroCalendar();

    expect(result.highImpact).toHaveLength(0);
    expect(result.today).toHaveLength(1);
    expect(result.signal).toBe('CLEAR');
  });

  it('should return CLEAR when no high-impact USD events today', async () => {
    mockedGet.mockResolvedValue({
      data: [makeEvent({ impact: 'Medium' })],
    });

    const result = await getMacroCalendar();

    expect(result.signal).toBe('CLEAR');
    expect(result.hasHighImpactToday).toBe(false);
  });

  it('should not include events from tomorrow', async () => {
    mockedGet.mockResolvedValue({
      data: [makeEvent({ date: '2026-03-16T13:30:00-0500' })],
    });

    const result = await getMacroCalendar();

    expect(result.today).toHaveLength(0);
    expect(result.highImpact).toHaveLength(0);
    expect(result.signal).toBe('CLEAR');
  });

  it('should compute positive minutesUntil for future events and negative for past events', async () => {
    // Future event: 18:30 UTC, now is 12:00 UTC => ~390 minutes
    const futureEvent = makeEvent({ title: 'Future', date: '2026-03-15T13:30:00-0500' }); // 18:30 UTC
    // Past event: 08:00 UTC, now is 12:00 UTC => ~-240 minutes
    const pastEvent = makeEvent({ title: 'Past', date: '2026-03-15T03:00:00-0500' }); // 08:00 UTC

    mockedGet.mockResolvedValue({
      data: [futureEvent, pastEvent],
    });

    const result = await getMacroCalendar();

    const future = result.today.find((e) => e.title === 'Future');
    const past = result.today.find((e) => e.title === 'Past');

    expect(future).toBeDefined();
    expect(future!.minutesUntil).toBeGreaterThan(0);
    expect(past).toBeDefined();
    expect(past!.minutesUntil).toBeLessThan(0);
  });

  it('should set nextHighImpact to the next future high-impact USD event', async () => {
    const earlyEvent = makeEvent({ title: 'Early', date: '2026-03-15T08:00:00-0500' }); // 13:00 UTC (future)
    const lateEvent = makeEvent({ title: 'Late', date: '2026-03-15T13:30:00-0500' }); // 18:30 UTC (future)

    mockedGet.mockResolvedValue({
      data: [lateEvent, earlyEvent],
    });

    const result = await getMacroCalendar();

    expect(result.nextHighImpact).not.toBeNull();
    expect(result.nextHighImpact!.title).toBe('Early');
  });

  it('should set nextHighImpact to null when all high-impact events have passed', async () => {
    const pastEvent = makeEvent({ title: 'Past Event', date: '2026-03-15T03:00:00-0500' }); // 08:00 UTC

    mockedGet.mockResolvedValue({
      data: [pastEvent],
    });

    const result = await getMacroCalendar();

    expect(result.nextHighImpact).toBeNull();
  });

  it('should return CLEAR fallback on network failure (not null, not throwing)', async () => {
    mockedGet.mockRejectedValue(new Error('Network Error'));

    const result = await getMacroCalendar();

    expect(result).not.toBeNull();
    expect(result.signal).toBe('CLEAR');
    expect(result.summary).toContain('unavailable');
    expect(result.today).toHaveLength(0);
  });

  it('should return CLEAR fallback on malformed response (not an array)', async () => {
    mockedGet.mockResolvedValue({
      data: { error: 'something went wrong' },
    });

    const result = await getMacroCalendar();

    expect(result).not.toBeNull();
    expect(result.signal).toBe('CLEAR');
    expect(result.summary).toContain('unavailable');
  });

  it('should set hasHighImpactToday to true when high-impact USD event present', async () => {
    mockedGet.mockResolvedValue({
      data: [makeEvent()],
    });

    const result = await getMacroCalendar();

    expect(result.hasHighImpactToday).toBe(true);
  });

  it('should include event title in summary when CAUTION', async () => {
    mockedGet.mockResolvedValue({
      data: [makeEvent({ title: 'FOMC Statement' })],
    });

    const result = await getMacroCalendar();

    expect(result.signal).toBe('CAUTION');
    expect(result.summary).toContain('FOMC Statement');
    expect(result.summary).toContain('HIGH IMPACT');
  });

  it('should return clear message in summary when CLEAR', async () => {
    mockedGet.mockResolvedValue({
      data: [makeEvent({ impact: 'Low' })],
    });

    const result = await getMacroCalendar();

    expect(result.summary).toContain('No high-impact USD events today');
    expect(result.summary).toContain('clear to trade');
  });

  it('should include all high-impact USD events in highImpact array', async () => {
    const event1 = makeEvent({ title: 'CPI m/m', date: '2026-03-15T08:30:00-0500' });
    const event2 = makeEvent({ title: 'FOMC Statement', date: '2026-03-15T14:00:00-0500' });
    const event3 = makeEvent({ title: 'Core CPI', date: '2026-03-15T08:30:00-0500' });

    mockedGet.mockResolvedValue({
      data: [event1, event2, event3],
    });

    const result = await getMacroCalendar();

    expect(result.highImpact).toHaveLength(3);
    const titles = result.highImpact.map((e) => e.title);
    expect(titles).toContain('CPI m/m');
    expect(titles).toContain('FOMC Statement');
    expect(titles).toContain('Core CPI');
  });
});
