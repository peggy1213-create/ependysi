/**
 * Fetch ETF constituents (top ~10 holdings) from Yahoo and cache them in
 * etf_holdings. Used for holdings-overlap detection. Best-effort / crumb-gated;
 * a bundled seed fills gaps for common Taiwan ETFs where Yahoo is thin.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { paths } from '../config.js';
import { listItems } from '../repos/watchlist.repo.js';
import { heldTickers } from '../repos/holdings.repo.js';
import { replaceHoldings, lastUpdated } from '../repos/etfHoldings.repo.js';
import { toYahooSymbol, normalizeComponent } from '../lib/ticker.js';
import * as yahoo from './yahoo.js';

const STALE_MS = 14 * 24 * 60 * 60 * 1000;
const SEED_PATH = resolve(paths.dataDir, 'etf-holdings.seed.json');

interface SeedFile {
  [etfTicker: string]: {
    as_of?: string;
    holdings: { ticker: string; name?: string; weight_pct: number }[];
  };
}

export async function refreshEtfHoldings(force = false): Promise<{ etfs: number; components: number }> {
  const etfItems = listItems().filter((i) => i.type === 'tw_etf' || i.type === 'us_etf');
  const held = heldTickers();
  let etfs = 0;
  let components = 0;

  const seed: SeedFile = existsSync(SEED_PATH)
    ? (JSON.parse(readFileSync(SEED_PATH, 'utf-8')) as SeedFile)
    : {};

  for (const etf of etfItems) {
    const updated = lastUpdated(etf.ticker);
    const fresh = updated && Date.now() - Date.parse(updated) < STALE_MS;
    if (fresh && !force) continue;
    // Only spend a network call on ETFs the user holds; others fall back to seed.
    const wantNetwork = held.has(etf.ticker) || force;

    let rows: { component_ticker: string; component_name: string | null; weight_pct: number; as_of: string | null; source: string }[] = [];

    if (wantNetwork) {
      const th = await yahoo.topHoldings(toYahooSymbol(etf.ticker, etf.market));
      if (th && th.holdings.length > 0) {
        const asOf = new Date().toISOString().slice(0, 10);
        rows = th.holdings.map((h) => ({
          component_ticker: normalizeComponent(h.symbol),
          component_name: h.name,
          weight_pct: h.weightPct,
          as_of: asOf,
          source: 'yahoo',
        }));
      }
    }

    if (rows.length === 0 && seed[etf.ticker]) {
      const s = seed[etf.ticker]!;
      rows = s.holdings.map((h) => ({
        component_ticker: normalizeComponent(h.ticker),
        component_name: h.name ?? null,
        weight_pct: h.weight_pct,
        as_of: s.as_of ?? null,
        source: 'seed',
      }));
    }

    if (rows.length > 0) {
      replaceHoldings(etf.ticker, rows);
      etfs++;
      components += rows.length;
    }
  }
  return { etfs, components };
}
