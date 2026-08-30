/**
 * The single normalized shape every trackable item is exposed as (per the brief).
 * Built by merging a watchlist row + cached quote + institutional latest.
 */
import type { Market, InstrumentType } from '../config.js';
import type { WatchlistItem } from '../repos/watchlist.repo.js';
import type { NormalizedQuote } from '../repos/quotes.repo.js';
import { getQuotes } from '../repos/quotes.repo.js';
import { latestFor } from '../repos/institutional.repo.js';
import { heldTickers } from '../repos/holdings.repo.js';

export interface NormalizedItem {
  id: number;
  ticker: string;
  name: string | null;
  price: number | null;
  change_pct: number | null;
  volume: number | null;
  market: Market;
  type: InstrumentType;
  currency: 'TWD' | 'USD' | null;

  // ETF-specific (null for stocks / indices)
  nav: number | null;
  premium_discount_pct: number | null;
  dividend_yield: number | null;
  expense_ratio: number | null;
  aum: number | null;
  next_ex_dividend_date: string | null;

  // Taiwan-specific
  foreign_net: number | null;
  foreign_net_date: string | null;

  // User metadata
  tags: string[];
  group_names: string[];
  in_portfolio: boolean;

  display_order: number;
  added_at: string;
  quote_age_seconds: number | null;
}

const isEtf = (t: InstrumentType): boolean => t === 'tw_etf' || t === 'us_etf';

export function normalizeWatchlist(items: WatchlistItem[]): NormalizedItem[] {
  const quotes = getQuotes(items.map((i) => i.ticker));
  const held = heldTickers();
  return items.map((item) => merge(item, quotes.get(item.ticker), held.has(item.ticker)));
}

function merge(
  item: WatchlistItem,
  q: NormalizedQuote | undefined,
  inPortfolio: boolean,
): NormalizedItem {
  const inst =
    item.market === 'TWSE' || item.market === 'TPEx' ? latestFor(item.ticker) : undefined;
  const etf = isEtf(item.type);

  return {
    id: item.id,
    ticker: item.ticker,
    name: q?.name ?? item.name,
    price: q?.price ?? null,
    change_pct: q?.change_pct ?? null,
    volume: q?.volume ?? null,
    market: item.market,
    type: item.type,
    currency: q?.currency ?? defaultCurrency(item.market),

    nav: etf ? (q?.nav ?? null) : null,
    premium_discount_pct: etf ? (q?.premium_discount_pct ?? null) : null,
    dividend_yield: etf ? (q?.dividend_yield ?? null) : null,
    expense_ratio: etf ? (q?.expense_ratio ?? null) : null,
    aum: etf ? (q?.aum ?? null) : null,
    next_ex_dividend_date: etf ? (q?.next_ex_dividend_date ?? null) : null,

    foreign_net: inst?.foreign_net ?? null,
    foreign_net_date: inst?.date ?? null,

    tags: item.tags,
    group_names: item.group_names,
    in_portfolio: inPortfolio,

    display_order: item.display_order,
    added_at: item.added_at,
    quote_age_seconds: q ? Math.round((Date.now() - Date.parse(q.fetched_at)) / 1000) : null,
  };
}

function defaultCurrency(market: Market): 'TWD' | 'USD' | null {
  if (market === 'TWSE' || market === 'TPEx') return 'TWD';
  if (market === 'US') return 'USD';
  return null;
}
