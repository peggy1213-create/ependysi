/**
 * Is the Taiwan stock market (likely) in a regular trading session right now?
 *
 * TWSE trades 09:00–13:30 Asia/Taipei, Mon–Fri. We extend the window to 13:35 to
 * catch the closing-auction print. There is no TWSE holiday calendar in the app,
 * so on a holiday this returns true and callers simply re-fetch unchanged prices.
 */
export function isTwMarketOpen(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

  const weekday = get('weekday');
  if (weekday === 'Sat' || weekday === 'Sun') return false;

  const minutes = (Number(get('hour')) % 24) * 60 + Number(get('minute'));
  return minutes >= 9 * 60 && minutes <= 13 * 60 + 35;
}
