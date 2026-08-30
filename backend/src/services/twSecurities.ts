/**
 * Refresh the Taiwan securities master (tw_securities) from TWSE + TPEx open
 * data. Runs on a daily cron and is also the `refresh:tw-list` script body.
 */
import { upsertTwSecurities, countTwSecurities } from '../repos/securities.repo.js';
import type { TwSecurity } from '../repos/securities.repo.js';
import * as twse from './twse.js';
import * as tpex from './tpex.js';

export async function refreshTwSecurities(): Promise<{ total: number; upserted: number }> {
  const merged = new Map<string, TwSecurity>();

  const results = await Promise.allSettled([twse.listedSecurities(), tpex.listedSecurities()]);
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const s of r.value) {
      if (!merged.has(s.ticker)) merged.set(s.ticker, s);
    }
  }

  if (merged.size === 0) {
    return { total: countTwSecurities(), upserted: 0 };
  }
  const rows = [...merged.values()];
  upsertTwSecurities(rows);
  return { total: countTwSecurities(), upserted: rows.length };
}
