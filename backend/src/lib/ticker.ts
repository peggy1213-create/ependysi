/**
 * Ticker auto-detection.
 *
 *  - 4-digit number            -> TWSE/TPEx stock (or ETF if it looks like one)
 *  - digits starting with "00" -> Taiwan ETF
 *  - "^XXX"                    -> index
 *  - "XXX=F"                   -> commodity future
 *  - "XXX-USD"                 -> crypto
 *  - letters                  -> US stock or ETF
 *
 * Market/type from the TW securities master when we have it; otherwise a best
 * guess that the name-resolution step (services) can still refine.
 */
import type { Market, InstrumentType } from '../config.js';
import { findTwSecurity } from '../repos/securities.repo.js';

export interface Detected {
  ticker: string;
  market: Market;
  type: InstrumentType;
  /** Yahoo Finance symbol for this ticker (for US / index / commodity / crypto / TW via .TW/.TWO). */
  yahooSymbol: string;
  nameHint?: string;
}

const TW_NUMERIC = /^\d{4,6}[A-Z]?$/;
const TW_ETF_NUMERIC = /^00\d{2,4}[A-Z]?$/;

export function detectInstrument(raw: string, typeHint?: InstrumentType): Detected {
  const ticker = raw.trim().toUpperCase();

  if (ticker.startsWith('^')) {
    return { ticker, market: 'INDEX', type: 'index', yahooSymbol: ticker };
  }
  if (ticker.endsWith('=F')) {
    return { ticker, market: 'US', type: 'commodity', yahooSymbol: ticker };
  }
  if (ticker.endsWith('-USD') || ticker.endsWith('=X')) {
    const type: InstrumentType = ticker.endsWith('-USD') ? 'crypto' : 'index';
    return { ticker, market: ticker.endsWith('-USD') ? 'US' : 'INDEX', type, yahooSymbol: ticker };
  }

  if (TW_NUMERIC.test(ticker)) {
    const known = findTwSecurity(ticker);
    if (known) {
      return {
        ticker,
        market: known.market,
        type: known.type,
        yahooSymbol: `${ticker}.${known.market === 'TPEx' ? 'TWO' : 'TW'}`,
        nameHint: known.name,
      };
    }
    const type: InstrumentType = TW_ETF_NUMERIC.test(ticker) ? 'tw_etf' : 'stock';
    // Unknown market — assume TWSE; the quote fetch will correct if it 404s.
    return { ticker, market: 'TWSE', type, yahooSymbol: `${ticker}.TW` };
  }

  // Letters -> US. ETF vs stock is refined later from Yahoo quoteType.
  const type: InstrumentType =
    typeHint === 'us_etf' || typeHint === 'crypto' || typeHint === 'commodity'
      ? typeHint
      : 'stock';
  return { ticker, market: 'US', type, yahooSymbol: ticker };
}

/** Yahoo symbol for a watchlist row we've already classified. */
export function toYahooSymbol(ticker: string, market: Market): string {
  if (market === 'TWSE') return `${ticker}.TW`;
  if (market === 'TPEx') return `${ticker}.TWO`;
  return ticker;
}
