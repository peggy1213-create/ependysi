/** Taiwan institutional net-flow history (外資/投信/自營商 買賣超). */
import { db, all, get } from '../db/index.js';

export interface InstitutionalRow {
  ticker: string;
  date: string;
  foreign_net: number | null;
  trust_net: number | null;
  dealer_net: number | null;
  fetched_at: string;
}

export function upsertInstitutional(rows: Omit<InstitutionalRow, 'fetched_at'>[]): number {
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO tw_institutional (ticker, date, foreign_net, trust_net, dealer_net, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(ticker, date) DO UPDATE SET
       foreign_net = excluded.foreign_net,
       trust_net   = excluded.trust_net,
       dealer_net  = excluded.dealer_net,
       fetched_at  = excluded.fetched_at`,
  );
  db.exec('BEGIN');
  try {
    for (const r of rows) {
      stmt.run(r.ticker, r.date, r.foreign_net, r.trust_net, r.dealer_net, now);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return rows.length;
}

export function historyFor(ticker: string, days = 20): InstitutionalRow[] {
  return all<InstitutionalRow>(
    'SELECT * FROM tw_institutional WHERE ticker = ? ORDER BY date DESC LIMIT ?',
    ticker,
    days,
  );
}

export function latestFor(ticker: string): InstitutionalRow | undefined {
  return get<InstitutionalRow>(
    'SELECT * FROM tw_institutional WHERE ticker = ? ORDER BY date DESC LIMIT 1',
    ticker,
  );
}
