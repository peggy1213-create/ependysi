/**
 * Currency → TWD conversion, derived from the always-on FX quotes in the cache.
 *
 * Yahoo conventions:
 *   TWD=X    = USD/TWD  (e.g. 31.6)
 *   JPY=X    = USD/JPY
 *   CNY=X    = USD/CNY
 *   EURUSD=X = EUR/USD
 */
import { getQuotes } from '../repos/quotes.repo.js';

export interface FxTable {
  /** multiply an amount in <key> by this to get TWD */
  rates: Record<string, number>;
  asOf: string | null;
  missing: string[];
}

export function ratesToTwd(): FxTable {
  const q = getQuotes(['TWD=X', 'JPY=X', 'CNY=X', 'EURUSD=X']);
  const usdTwd = q.get('TWD=X')?.price ?? null;
  const usdJpy = q.get('JPY=X')?.price ?? null;
  const usdCny = q.get('CNY=X')?.price ?? null;
  const eurUsd = q.get('EURUSD=X')?.price ?? null;

  const rates: Record<string, number> = { TWD: 1 };
  const missing: string[] = [];

  if (usdTwd) rates.USD = usdTwd;
  else missing.push('USD');

  if (usdTwd && usdJpy) rates.JPY = usdTwd / usdJpy;
  if (usdTwd && usdCny) rates.CNY = usdTwd / usdCny;
  if (usdTwd && eurUsd) rates.EUR = usdTwd * eurUsd;
  if (usdTwd) rates.HKD = usdTwd / 7.8; // pegged; good enough without a HKD=X quote

  const asOf = q.get('TWD=X')?.fetched_at ?? null;
  return { rates, asOf, missing };
}

/** Convert `amount` in `currency` to TWD, or null if the rate is unknown. */
export function toTwd(amount: number | null, currency: string | null, fx: FxTable): number | null {
  if (amount == null || !currency) return null;
  const rate = fx.rates[currency.toUpperCase()];
  return rate != null ? amount * rate : null;
}
