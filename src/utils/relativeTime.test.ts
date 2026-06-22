import { relativeTime } from './relativeTime';

// Fixed "now": Wed 2026-06-17, 15:00 local. setSystemTime pins Date so the branches are deterministic.
const NOW = new Date(2026, 5, 17, 15, 0, 0).getTime();
const DAY = 86_400_000;

describe('relativeTime', () => {
  beforeAll(() => { jest.useFakeTimers().setSystemTime(NOW); });
  afterAll(() => { jest.useRealTimers(); });

  it('returns empty string for 0 (no activity)', () => {
    expect(relativeTime(0)).toBe('');
  });

  it('shows a clock time for earlier today', () => {
    const out = relativeTime(NOW - 3 * 60 * 60 * 1000); // 3h earlier, same day
    expect(out).toContain(':');           // e.g. "12:00 PM" / "12:00"
    expect(out).toMatch(/\d/);
  });

  it('shows a weekday for within the last week', () => {
    const out = relativeTime(NOW - 3 * DAY);
    expect(out).toMatch(/^[A-Za-z]{3,}$/); // e.g. "Sun" — letters only, no digits
  });

  it('shows month + day (no year) for earlier this year', () => {
    const out = relativeTime(NOW - 40 * DAY);
    expect(out).toMatch(/\d/);             // includes a day number
    expect(out).not.toContain('2026');     // same year → year omitted
  });

  it('includes the year for a prior calendar year', () => {
    const out = relativeTime(NOW - 400 * DAY); // → 2025
    expect(out).toContain('2025');
  });
});
