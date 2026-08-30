/** Market-wide institutional flow history (tw_market_flow). */
import { all, run } from '../db/index.js';

export interface MarketFlowRow {
  date: string;
  foreign_net: number | null;
  trust_net: number | null;
  dealer_net: number | null;
  fetched_at: string;
}

export function recentFlow(days = 5): MarketFlowRow[] {
  return all<MarketFlowRow>('SELECT * FROM tw_market_flow ORDER BY date DESC LIMIT ?', days);
}

export function upsertFlow(r: Omit<MarketFlowRow, 'fetched_at'>): void {
  run(
    `INSERT INTO tw_market_flow (date, foreign_net, trust_net, dealer_net, fetched_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       foreign_net = excluded.foreign_net,
       trust_net   = excluded.trust_net,
       dealer_net  = excluded.dealer_net,
       fetched_at  = excluded.fetched_at`,
    r.date,
    r.foreign_net,
    r.trust_net,
    r.dealer_net,
    new Date().toISOString(),
  );
}
