import { currentWeekStart, parseMondayWeekParam } from './weeks';

describe('currentWeekStart', () => {
  it('returns the same Monday for every day of the calendar week', () => {
    // 2024-01-01 is a Monday; the week runs Mon 2024-01-01 … Sun 2024-01-07.
    expect(currentWeekStart(new Date(2024, 0, 1, 0, 0, 0))).toBe('2024-01-01');
    expect(currentWeekStart(new Date(2024, 0, 3, 12, 0, 0))).toBe('2024-01-01');
    expect(currentWeekStart(new Date(2024, 0, 7, 23, 59, 59))).toBe(
      '2024-01-01',
    );
    // Next Monday rolls forward.
    expect(currentWeekStart(new Date(2024, 0, 8, 0, 0, 0))).toBe('2024-01-08');
  });

  it('handles month and year boundaries', () => {
    // 2023-12-31 is a Sunday → week starts Monday 2023-12-25.
    expect(currentWeekStart(new Date(2023, 11, 31, 12, 0, 0))).toBe(
      '2023-12-25',
    );
    // 2024-01-01 (Monday) starts a new week and a new year.
    expect(currentWeekStart(new Date(2024, 0, 1, 12, 0, 0))).toBe('2024-01-01');
  });
});

describe('parseMondayWeekParam', () => {
  it('accepts a Monday in YYYY-MM-DD form', () => {
    expect(parseMondayWeekParam('2024-01-01')).toBe('2024-01-01');
    expect(parseMondayWeekParam('2024-02-05')).toBe('2024-02-05');
  });

  it('rejects non-Monday dates', () => {
    // 2024-01-02 is a Tuesday.
    expect(parseMondayWeekParam('2024-01-02')).toBeNull();
    // 2024-01-07 is a Sunday.
    expect(parseMondayWeekParam('2024-01-07')).toBeNull();
  });

  it('rejects malformed or impossible dates', () => {
    expect(parseMondayWeekParam(undefined)).toBeNull();
    expect(parseMondayWeekParam('')).toBeNull();
    expect(parseMondayWeekParam('not-a-date')).toBeNull();
    expect(parseMondayWeekParam('2024-1-1')).toBeNull();
    expect(parseMondayWeekParam('2024-02-30')).toBeNull();
    expect(parseMondayWeekParam('2024-13-01')).toBeNull();
    expect(parseMondayWeekParam('2024-01-01T00:00:00')).toBeNull();
    expect(parseMondayWeekParam('2024-01-01; --')).toBeNull();
  });
});
