/**
 * Dividend tracking: upcoming ex-dates, estimated forward income (TWD), and a
 * history log (manual entries + auto-detected estimates).
 *
 * Estimates are yield-based (price × dividend_yield). Frequency isn't reliably
 * available for TW ETFs, so we report annualised figures and clearly flag
 * auto rows as estimates for the user to correct.
 */
import { listLots } from '../repos/holdings.repo.js';
import { getQuotes } from '../repos/quotes.repo.js';
import { listItems } from '../repos/watchlist.repo.js';
import { listDividends, addDividend, hasAutoDividend } from '../repos/dividends.repo.js';
import type { Dividend } from '../repos/dividends.repo.js';
import { ratesToTwd, toTwd } from './fx.js';
import { computePortfolio } from './portfolio.js';

const r2 = (n: number | null): number | null => (n == null ? null : Math.round(n * 100) / 100);
const today = (): string => new Date().toISOString().slice(0, 10);

function sharesByTicker(): Map<string, number> {
  const m = new Map<string, number>();
  for (const lot of listLots()) m.set(lot.ticker, (m.get(lot.ticker) ?? 0) + lot.shares);
  return m;
}

export interface UpcomingDividend {
  ticker: string;
  name: string | null;
  ex_date: string;
  shares: number;
  dividend_yield: number | null;
  currency: string | null;
  est_annual_income_twd: number | null;
}

export function upcomingDividends(): UpcomingDividend[] {
  const shares = sharesByTicker();
  if (shares.size === 0) return [];
  const quotes = getQuotes([...shares.keys()]);
  const names = new Map(listItems().map((i) => [i.ticker, i.name]));
  const fx = ratesToTwd();
  const cutoff = today();

  const out: UpcomingDividend[] = [];
  for (const [ticker, sh] of shares) {
    const q = quotes.get(ticker);
    if (!q?.next_ex_dividend_date || q.next_ex_dividend_date < cutoff) continue;
    const annualOrig =
      q.price != null && q.dividend_yield != null ? (q.price * q.dividend_yield) / 100 * sh : null;
    out.push({
      ticker,
      name: q.name ?? names.get(ticker) ?? null,
      ex_date: q.next_ex_dividend_date,
      shares: r2(sh)!,
      dividend_yield: q.dividend_yield,
      currency: q.currency,
      est_annual_income_twd: r2(toTwd(annualOrig, q.currency, fx)),
    });
  }
  return out.sort((a, b) => a.ex_date.localeCompare(b.ex_date));
}

export interface DividendSummary {
  base_currency: string;
  generated_at: string;
  estimated_annual_income_twd: number;
  by_ticker: {
    ticker: string;
    name: string | null;
    dividend_yield: number | null;
    market_value_twd: number | null;
    est_annual_income_twd: number | null;
  }[];
  upcoming: UpcomingDividend[];
  history: (Dividend & { total_amount_twd: number | null })[];
  history_total_twd: number;
}

export function dividendSummary(): DividendSummary {
  const snap = computePortfolio();
  const fx = snap.fx;
  const history = listDividends().map((d) => ({
    ...d,
    total_amount_twd: r2(toTwd(d.total_amount ?? null, d.currency, fx)),
  }));
  const historyTotal = history.reduce((a, d) => a + (d.total_amount_twd ?? 0), 0);

  return {
    base_currency: snap.base_currency,
    generated_at: snap.generated_at,
    estimated_annual_income_twd: snap.totals.est_annual_income_twd,
    by_ticker: snap.positions
      .filter((p) => p.dividend_yield != null && p.dividend_yield > 0)
      .map((p) => ({
        ticker: p.ticker,
        name: p.name,
        dividend_yield: p.dividend_yield,
        market_value_twd: p.market_value_twd,
        est_annual_income_twd: p.est_annual_income_twd,
      })),
    upcoming: upcomingDividends(),
    history,
    history_total_twd: r2(historyTotal)!,
  };
}

/**
 * Auto-detect: for each held ticker whose cached ex-dividend date has now
 * passed and has no 'auto' row yet, insert a yield-based ESTIMATE for the user
 * to verify/correct.
 */
export function autoDetectDividends(): { created: number; tickers: string[] } {
  const shares = sharesByTicker();
  const quotes = getQuotes([...shares.keys()]);
  const cutoff = today();
  const created: string[] = [];

  for (const [ticker, sh] of shares) {
    const q = quotes.get(ticker);
    const ex = q?.next_ex_dividend_date;
    if (!ex || ex >= cutoff) continue; // only past ex-dates
    if (hasAutoDividend(ticker, ex)) continue;
    if (q.price == null || q.dividend_yield == null || q.dividend_yield <= 0) continue;

    const annualPerShare = (q.price * q.dividend_yield) / 100;
    addDividend({
      ticker,
      ex_date: ex,
      pay_date: null,
      amount_per_share: r2(annualPerShare)!,
      currency: q.currency ?? 'TWD',
      shares: r2(sh),
      total_amount: r2(annualPerShare * sh),
      source: 'auto',
      note: 'auto-estimated (annualised from yield) — edit amount_per_share to the actual payout',
    });
    created.push(ticker);
  }
  return { created: created.length, tickers: created };
}
