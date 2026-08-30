/**
 * Populate instrument_meta (sector / industry / region) for tickers that need
 * it — driven by the watchlist + holdings. Region is derived instantly from the
 * market; sector/industry come from Yahoo (best-effort, crumb-gated).
 */
import { listItems } from '../repos/watchlist.repo.js';
import { getMeta, upsertMeta } from '../repos/meta.repo.js';
import { heldTickers } from '../repos/holdings.repo.js';
import { regionOf } from '../lib/classify.js';
import { toYahooSymbol } from '../lib/ticker.js';
import * as yahoo from './yahoo.js';

const STALE_MS = 7 * 24 * 60 * 60 * 1000;

export async function refreshInstrumentMeta(): Promise<{ updated: number }> {
  const items = listItems();
  const held = heldTickers();
  let updated = 0;

  for (const item of items) {
    const region = regionOf(item.market);
    const existing = getMeta(item.ticker);

    // region is free — always keep it current
    if (!existing || existing.region !== region) {
      upsertMeta(item.ticker, { region });
      updated++;
    }

    const needsSector =
      item.type === 'stock' &&
      (!existing || (!existing.sector && !existing.industry) || isStale(existing.updated_at)) &&
      // prioritise things actually held
      (held.has(item.ticker) || !existing);

    if (needsSector) {
      const p = await yahoo.profile(toYahooSymbol(item.ticker, item.market));
      if (p) {
        upsertMeta(item.ticker, { sector: p.sector, industry: p.industry, region });
        updated++;
      }
    }
  }
  return { updated };
}

function isStale(iso: string): boolean {
  return Date.now() - Date.parse(iso) > STALE_MS;
}
