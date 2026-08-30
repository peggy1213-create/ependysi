/** Republic-of-China (Minguo) calendar helpers used by TWSE/TPEx open data. */

/** "1150828" or "115/08/28" -> "2026-08-28". Returns '' if unparseable. */
export function rocToIso(input: string | number): string {
  const digits = String(input).replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 7) return '';
  const s = digits.padStart(7, '0');
  const year = Number(s.slice(0, 3)) + 1911;
  const month = s.slice(3, 5);
  const day = s.slice(5, 7);
  return `${year}-${month}-${day}`;
}

/** "2026-08-28" -> "20260828" (TWSE query param format). */
export function isoToTwseDate(iso: string): string {
  return iso.replace(/-/g, '');
}

/** Most recent weekday on or before `date` (defaults to today), ISO. */
export function lastTradingDayIso(date = new Date()): string {
  const d = new Date(date);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
