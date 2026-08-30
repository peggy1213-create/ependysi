/** Taiwan securities master — lookup + search + bulk upsert. */
import { db, all, get } from '../db/index.js';

export interface TwSecurity {
  ticker: string;
  name: string;
  market: 'TWSE' | 'TPEx';
  type: 'stock' | 'tw_etf';
}

export function findTwSecurity(ticker: string): TwSecurity | undefined {
  return get<TwSecurity>(
    'SELECT ticker, name, market, type FROM tw_securities WHERE ticker = ?',
    ticker,
  );
}

/** Search by ticker prefix or name substring. */
export function searchTwSecurities(query: string, limit = 20): TwSecurity[] {
  const q = query.trim();
  if (!q) return [];
  return all<TwSecurity>(
    `SELECT ticker, name, market, type FROM tw_securities
     WHERE ticker LIKE ? OR name LIKE ?
     ORDER BY (ticker = ?) DESC, LENGTH(ticker), ticker
     LIMIT ?`,
    `${q}%`,
    `%${q}%`,
    q,
    limit,
  );
}

export function countTwSecurities(): number {
  return get<{ c: number }>('SELECT COUNT(*) AS c FROM tw_securities')?.c ?? 0;
}

export function upsertTwSecurities(rows: TwSecurity[]): number {
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO tw_securities (ticker, name, market, type, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(ticker) DO UPDATE SET
       name = excluded.name, market = excluded.market,
       type = excluded.type, updated_at = excluded.updated_at`,
  );
  db.exec('BEGIN');
  try {
    for (const r of rows) stmt.run(r.ticker, r.name, r.market, r.type, now);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return rows.length;
}
