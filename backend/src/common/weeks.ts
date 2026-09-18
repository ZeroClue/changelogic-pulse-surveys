/**
 * Calendar week helpers (SPEC §3): a week is Monday 00:00:00 through Sunday
 * 23:59:59.999 in the SERVER timezone. `week_start` is the Monday date stored
 * as `YYYY-MM-DD`, computed server-side (never from the client).
 */

const WEEK_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function formatYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Monday of the week containing `now`, server timezone. */
export function currentWeekStart(now: Date = new Date()): string {
  // getDay(): Sunday=0 → shift so Monday is 0.
  const weekday = (now.getDay() + 6) % 7;
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - weekday,
  );
  return formatYmd(monday);
}

/**
 * Validates a client-supplied `?week=` value: must be a real calendar date in
 * `YYYY-MM-DD` form (zero-padded, round-trips through Date) AND be a Monday.
 * Returns the normalized date string, or null when invalid (review S-4).
 */
export function parseMondayWeekParam(value: string | undefined): string | null {
  if (!value || !WEEK_PATTERN.test(value)) {
    return null;
  }
  const [year, month, day] = value.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date.getDay() === 1 ? formatYmd(date) : null;
}
