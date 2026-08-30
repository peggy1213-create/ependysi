/**
 * Ticker search across the Taiwan securities master and US tickers, so the user
 * can find something by number or name and add it to the watchlist.
 */
import type { Market, InstrumentType } from '../config.js';
import { searchTwSecurities } from '../repos/securities.repo.js';
import * as twse from './twse.js';
import * as yahoo from './yahoo.js';

export interface SearchHit {
  ticker: string;
  name: string | null;
  market: Market;
  type: InstrumentType;
  yahoo_symbol: string;
  source: 'tw' | 'us';
}

export async function searchTickers(query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const isNumeric = /^\d{2,6}[A-Z]?$/.test(q);
  const looksUs = /[A-Za-z]/.test(q) && !/[一-鿿]/.test(q);
  const hits = new Map<string, SearchHit>();

  // Taiwan — local master first (has market + type), then codeQuery for names/coverage
  for (const s of searchTwSecurities(q, 20)) {
    hits.set(s.ticker, {
      ticker: s.ticker,
      name: s.name,
      market: s.market,
      type: s.type,
      yahoo_symbol: `${s.ticker}.${s.market === 'TPEx' ? 'TWO' : 'TW'}`,
      source: 'tw',
    });
  }
  if (isNumeric || /[一-鿿]/.test(q)) {
    for (const c of await twse.codeQuery(q)) {
      if (hits.has(c.ticker)) continue;
      const etf = /^00\d{2,4}[A-Z]?$/.test(c.ticker);
      hits.set(c.ticker, {
        ticker: c.ticker,
        name: c.name,
        market: 'TWSE',
        type: etf ? 'tw_etf' : 'stock',
        yahoo_symbol: `${c.ticker}.TW`,
        source: 'tw',
      });
    }
  }

  // US
  if (looksUs || hits.size === 0) {
    for (const h of await yahoo.search(q)) {
      if (/\.(TW|TWO)$/i.test(h.symbol)) continue;
      if (hits.has(h.symbol)) continue;
      hits.set(h.symbol, {
        ticker: h.symbol,
        name: h.name,
        market: mapMarket(h.quoteType),
        type: mapType(h.quoteType),
        yahoo_symbol: h.symbol,
        source: 'us',
      });
    }
  }

  return [...hits.values()].slice(0, 25);
}

function mapMarket(quoteType: string | null): Market {
  if (quoteType === 'INDEX') return 'INDEX';
  return 'US';
}

function mapType(quoteType: string | null): InstrumentType {
  switch (quoteType) {
    case 'ETF':
      return 'us_etf';
    case 'INDEX':
      return 'index';
    case 'CRYPTOCURRENCY':
      return 'crypto';
    case 'FUTURE':
      return 'commodity';
    default:
      return 'stock';
  }
}
