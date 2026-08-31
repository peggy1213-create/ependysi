export const nf = (n: number, dp = 2): string =>
  n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

export function num(n: number | null | undefined, dp = 2): string {
  if (n == null || Number.isNaN(n)) return '—';
  return nf(n, dp);
}

export function pct(n: number | null | undefined, dp = 2): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n > 0 ? '+' : ''}${nf(n, dp)}%`;
}

export function signed(n: number | null | undefined, dp = 0): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n > 0 ? '+' : ''}${nf(n, dp)}`;
}

/** Compact TWD / big numbers: 1.2M, 34.5K, 2.1B */
export function compact(n: number | null | undefined, dp = 1): string {
  if (n == null || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}${nf(abs / 1e12, dp)}T`;
  if (abs >= 1e8) return `${sign}${nf(abs / 1e8, dp)}億`;
  if (abs >= 1e4) return `${sign}${nf(abs / 1e4, dp)}萬`;
  return `${sign}${nf(abs, 0)}`;
}

export function money(n: number | null | undefined, ccy = 'TWD', compactMode = false): string {
  if (n == null || Number.isNaN(n)) return '—';
  const sym = ccy === 'TWD' ? 'NT$' : ccy === 'USD' ? '$' : `${ccy} `;
  return compactMode ? `${sym}${compact(n)}` : `${sym}${nf(n, 0)}`;
}

/** shares: no decimals unless fractional */
export function shares(n: number | null | undefined): string {
  if (n == null) return '—';
  return Number.isInteger(n) ? nf(n, 0) : nf(n, 4);
}

/** direction → theme color class (amber up / violet down / neutral flat) */
export function dirClass(n: number | null | undefined): string {
  if (n == null || n === 0) return 'text-fg-muted';
  return n > 0 ? 'text-bullish' : 'text-bearish';
}
export function dirBg(n: number | null | undefined): string {
  if (n == null || n === 0) return 'bg-neutral/10';
  return n > 0 ? 'bg-bullish/12' : 'bg-bearish/12';
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return '—';
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/** YYYY/MM/DD (local time) from a timestamp, ISO string, or Date. */
export function ymd(input: number | string | Date | null | undefined): string {
  if (input == null || input === 0) return '—';
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}/${m}/${day}`;
}

export function dateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

/** YYYY/MM/DD HH:MM (local time) from a timestamp, ISO string, or Date. */
export function dateTime(input: number | string | Date | null | undefined): string {
  if (input == null || input === 0) return '—';
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${ymd(d)} ${hh}:${mm}`;
}

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.round((Date.parse(iso) - Date.now()) / 86400000);
}
