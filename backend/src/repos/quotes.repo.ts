/** Normalized quote cache — one row per ticker, refreshed by services/jobs. */
import { db, all, get } from '../db/index.js';
import type { Market, InstrumentType } from '../config.js';

export interface NormalizedQuote {
  ticker: string;
  name: string | null;
  price: number | null;
  change_pct: number | null;
  volume: number | null;
  market: Market;
  type: InstrumentType;
  currency: 'TWD' | 'USD' | null;
  nav: number | null;
  premium_discount_pct: number | null;
  dividend_yield: number | null;
  expense_ratio: number | null;
  aum: number | null;
  next_ex_dividend_date: string | null;
  extra: Record<string, unknown> | null;
  source: string | null;
  fetched_at: string;
}

type QuoteRow = Omit<NormalizedQuote, 'extra'> & { extra: string | null };

function hydrate(row: QuoteRow): NormalizedQuote {
  return { ...row, extra: row.extra ? (JSON.parse(row.extra) as Record<string, unknown>) : null };
}

export function getQuote(ticker: string): NormalizedQuote | undefined {
  const row = get<QuoteRow>('SELECT * FROM quote_cache WHERE ticker = ?', ticker);
  return row ? hydrate(row) : undefined;
}

export function getQuotes(tickers: string[]): Map<string, NormalizedQuote> {
  const out = new Map<string, NormalizedQuote>();
  if (tickers.length === 0) return out;
  const placeholders = tickers.map(() => '?').join(',');
  for (const row of all<QuoteRow>(
    `SELECT * FROM quote_cache WHERE ticker IN (${placeholders})`,
    ...tickers,
  )) {
    out.set(row.ticker, hydrate(row));
  }
  return out;
}

export type QuoteUpsert = Partial<NormalizedQuote> & Pick<NormalizedQuote, 'ticker'>;

/** Upsert; provided fields overwrite, omitted fields are preserved. */
export function upsertQuote(q: QuoteUpsert): void {
  const prev = get<QuoteRow>('SELECT * FROM quote_cache WHERE ticker = ?', q.ticker);
  const merged: Record<string, string | number | null> = {
    ticker: q.ticker,
    name: q.name ?? prev?.name ?? null,
    price: q.price ?? prev?.price ?? null,
    change_pct: q.change_pct ?? prev?.change_pct ?? null,
    volume: q.volume ?? prev?.volume ?? null,
    market: q.market ?? prev?.market ?? null,
    type: q.type ?? prev?.type ?? null,
    currency: q.currency ?? prev?.currency ?? null,
    nav: q.nav ?? prev?.nav ?? null,
    premium_discount_pct: q.premium_discount_pct ?? prev?.premium_discount_pct ?? null,
    dividend_yield: q.dividend_yield ?? prev?.dividend_yield ?? null,
    expense_ratio: q.expense_ratio ?? prev?.expense_ratio ?? null,
    aum: q.aum ?? prev?.aum ?? null,
    next_ex_dividend_date: q.next_ex_dividend_date ?? prev?.next_ex_dividend_date ?? null,
    extra: q.extra ? JSON.stringify(q.extra) : (prev?.extra ?? null),
    source: q.source ?? prev?.source ?? null,
    fetched_at: q.fetched_at ?? new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO quote_cache
       (ticker, name, price, change_pct, volume, market, type, currency,
        nav, premium_discount_pct, dividend_yield, expense_ratio, aum,
        next_ex_dividend_date, extra, source, fetched_at)
     VALUES
       ($ticker, $name, $price, $change_pct, $volume, $market, $type, $currency,
        $nav, $premium_discount_pct, $dividend_yield, $expense_ratio, $aum,
        $next_ex_dividend_date, $extra, $source, $fetched_at)
     ON CONFLICT(ticker) DO UPDATE SET
        name=$name, price=$price, change_pct=$change_pct, volume=$volume,
        market=$market, type=$type, currency=$currency, nav=$nav,
        premium_discount_pct=$premium_discount_pct, dividend_yield=$dividend_yield,
        expense_ratio=$expense_ratio, aum=$aum,
        next_ex_dividend_date=$next_ex_dividend_date, extra=$extra,
        source=$source, fetched_at=$fetched_at`,
  ).run(merged as Record<string, string | number | null>);
}
