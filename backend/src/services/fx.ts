/**
 * Currency → TWD conversion, read straight from the always-on FX quotes.
 *
 * All pairs are quoted TWD-per-unit, so the quote price IS the conversion factor:
 *   TWD=X     = USD/TWD   (≈ 31.6 TWD per USD)
 *   JPYTWD=X  = JPY/TWD   (≈ 0.195 TWD per JPY)
 *   EURTWD=X  = EUR/TWD
 *   CNYTWD=X  = CNY/TWD
 *   HKDTWD=X  = HKD/TWD
 */
import { getQuotes } from '../repos/quotes.repo.js';

export interface FxTable {
  /** multiply an amount in <key> by this to get TWD */
  rates: Record<string, number>;
  asOf: string | null;
  missing: string[];
}

const PAIRS: [currency: string, symbol: string][] = [
  ['USD', 'TWD=X'],
  ['JPY', 'JPYTWD=X'],
  ['EUR', 'EURTWD=X'],
  ['CNY', 'CNYTWD=X'],
  ['HKD', 'HKDTWD=X'],
  ['GBP', 'GBPTWD=X'],
];

export function ratesToTwd(): FxTable {
  const q = getQuotes(PAIRS.map(([, s]) => s));
  const rates: Record<string, number> = { TWD: 1 };
  const missing: string[] = [];

  for (const [ccy, sym] of PAIRS) {
    const p = q.get(sym)?.price ?? null;
    if (p) rates[ccy] = p;
    else missing.push(ccy);
  }

  const asOf = q.get('TWD=X')?.fetched_at ?? null;
  return { rates, asOf, missing };
}

/** Convert `amount` in `currency` to TWD, or null if the rate is unknown. */
export function toTwd(amount: number | null, currency: string | null, fx: FxTable): number | null {
  if (amount == null || !currency) return null;
  const rate = fx.rates[currency.toUpperCase()];
  return rate != null ? amount * rate : null;
}
