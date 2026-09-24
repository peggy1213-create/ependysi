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
  last_dividend: number | null;
  last_dividend_date: string | null;
  target_mean_price: number | null;
  target_high_price: number | null;
  target_low_price: number | null;
  analyst_count: number | null;
  target_price_at: string | null;
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
  ma240: number | null;
  ma_at: string | null;
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
    last_dividend: q.last_dividend ?? prev?.last_dividend ?? null,
    last_dividend_date: q.last_dividend_date ?? prev?.last_dividend_date ?? null,
    target_mean_price: q.target_mean_price ?? prev?.target_mean_price ?? null,
    target_high_price: q.target_high_price ?? prev?.target_high_price ?? null,
    target_low_price: q.target_low_price ?? prev?.target_low_price ?? null,
    analyst_count: q.analyst_count ?? prev?.analyst_count ?? null,
    target_price_at: q.target_price_at ?? prev?.target_price_at ?? null,
    ma5: q.ma5 ?? prev?.ma5 ?? null,
    ma20: q.ma20 ?? prev?.ma20 ?? null,
    ma60: q.ma60 ?? prev?.ma60 ?? null,
    ma240: q.ma240 ?? prev?.ma240 ?? null,
    ma_at: q.ma_at ?? prev?.ma_at ?? null,
    extra: q.extra ? JSON.stringify(q.extra) : (prev?.extra ?? null),
    source: q.source ?? prev?.source ?? null,
    fetched_at: q.fetched_at ?? new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO quote_cache
       (ticker, name, price, change_pct, volume, market, type, currency,
        nav, premium_discount_pct, dividend_yield, expense_ratio, aum,
        next_ex_dividend_date, last_dividend, last_dividend_date,
        target_mean_price, target_high_price, target_low_price, analyst_count, target_price_at,
        ma5, ma20, ma60, ma240, ma_at,
        extra, source, fetched_at)
     VALUES
       ($ticker, $name, $price, $change_pct, $volume, $market, $type, $currency,
        $nav, $premium_discount_pct, $dividend_yield, $expense_ratio, $aum,
        $next_ex_dividend_date, $last_dividend, $last_dividend_date,
        $target_mean_price, $target_high_price, $target_low_price, $analyst_count, $target_price_at,
        $ma5, $ma20, $ma60, $ma240, $ma_at,
        $extra, $source, $fetched_at)
     ON CONFLICT(ticker) DO UPDATE SET
        name=$name, price=$price, change_pct=$change_pct, volume=$volume,
        market=$market, type=$type, currency=$currency, nav=$nav,
        premium_discount_pct=$premium_discount_pct, dividend_yield=$dividend_yield,
        expense_ratio=$expense_ratio, aum=$aum,
        next_ex_dividend_date=$next_ex_dividend_date,
        last_dividend=$last_dividend, last_dividend_date=$last_dividend_date,
        target_mean_price=$target_mean_price, target_high_price=$target_high_price,
        target_low_price=$target_low_price, analyst_count=$analyst_count,
        target_price_at=$target_price_at,
        ma5=$ma5, ma20=$ma20, ma60=$ma60, ma240=$ma240, ma_at=$ma_at,
        extra=$extra, source=$source, fetched_at=$fetched_at`,
  ).run(merged as Record<string, string | number | null>);
}
