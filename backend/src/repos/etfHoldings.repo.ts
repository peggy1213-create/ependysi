/** etf_holdings — ETF constituents for overlap detection. */
import { db, all, get } from '../db/index.js';

export interface EtfHoldingRow {
  etf_ticker: string;
  component_ticker: string; // normalized bare ticker
  component_name: string | null;
  weight_pct: number;
  as_of: string | null;
  source: string;
}

export function holdingsOf(etfTicker: string): EtfHoldingRow[] {
  return all<EtfHoldingRow>(
    'SELECT * FROM etf_holdings WHERE etf_ticker = ? ORDER BY weight_pct DESC',
    etfTicker,
  );
}

export function holdingsOfMany(etfTickers: string[]): Map<string, EtfHoldingRow[]> {
  const out = new Map<string, EtfHoldingRow[]>();
  for (const t of etfTickers) out.set(t, holdingsOf(t));
  return out;
}

export function lastUpdated(etfTicker: string): string | undefined {
  return get<{ as_of: string }>(
    'SELECT MAX(as_of) AS as_of FROM etf_holdings WHERE etf_ticker = ?',
    etfTicker,
  )?.as_of;
}

export function replaceHoldings(etfTicker: string, rows: Omit<EtfHoldingRow, 'etf_ticker'>[]): void {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM etf_holdings WHERE etf_ticker = ?').run(etfTicker);
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO etf_holdings
         (etf_ticker, component_ticker, component_name, weight_pct, as_of, source)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const r of rows) {
      stmt.run(etfTicker, r.component_ticker, r.component_name, r.weight_pct, r.as_of, r.source);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
