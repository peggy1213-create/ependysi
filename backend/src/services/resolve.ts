/**
 * Turn a raw user-typed ticker into a fully classified, named instrument,
 * ready to insert into the watchlist.
 */
import type { Market, InstrumentType } from '../config.js';
import { detectInstrument } from '../lib/ticker.js';
import { findTwSecurity } from '../repos/securities.repo.js';
import * as twse from './twse.js';
import * as yahoo from './yahoo.js';

export interface ResolvedInstrument {
  ticker: string;
  name: string | null;
  market: Market;
  type: InstrumentType;
}

export async function resolveInstrument(
  raw: string,
  typeHint?: InstrumentType,
): Promise<ResolvedInstrument> {
  const detected = detectInstrument(raw, typeHint);
  const { ticker, market } = detected;
  let { type } = detected;
  let name: string | null = detected.nameHint ?? null;

  if (market === 'TWSE' || market === 'TPEx') {
    if (!name) {
      const known = findTwSecurity(ticker);
      name = known?.name ?? (await twse.resolveName(ticker));
    }
  } else {
    // US / index / commodity / crypto — confirm via Yahoo
    const q = await yahoo.chart(detected.yahooSymbol);
    if (q) {
      name = q.name ?? name;
      if (type === 'stock' && q.quoteType === 'ETF') type = 'us_etf';
      if (q.quoteType === 'CRYPTOCURRENCY') type = 'crypto';
      if (q.quoteType === 'INDEX') type = 'index';
    } else {
      const hits = await yahoo.search(ticker);
      const hit = hits.find((h) => h.symbol.toUpperCase() === ticker) ?? hits[0];
      if (hit) {
        name = hit.name ?? name;
        if (hit.quoteType === 'ETF') type = 'us_etf';
      }
    }
  }

  return { ticker, name, market, type };
}
