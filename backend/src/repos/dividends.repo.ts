/** Dividend log — manual entries + auto-detected estimates. */
import { all, get, run } from '../db/index.js';

export interface Dividend {
  id: number;
  ticker: string;
  ex_date: string | null;
  pay_date: string | null;
  amount_per_share: number;
  currency: string;
  shares: number | null;
  total_amount: number | null;
  source: 'manual' | 'auto';
  note: string | null;
  created_at: string;
}

export type NewDividend = Omit<Dividend, 'id' | 'created_at'>;

export function listDividends(ticker?: string): Dividend[] {
  return ticker
    ? all<Dividend>('SELECT * FROM dividends WHERE ticker = ? ORDER BY ex_date DESC, id DESC', ticker)
    : all<Dividend>('SELECT * FROM dividends ORDER BY ex_date DESC, id DESC');
}

export function addDividend(d: NewDividend): Dividend {
  const total = d.total_amount ?? (d.shares != null ? d.amount_per_share * d.shares : null);
  const info = run(
    `INSERT INTO dividends
       (ticker, ex_date, pay_date, amount_per_share, currency, shares, total_amount, source, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(ticker, ex_date, source) DO UPDATE SET
       pay_date = excluded.pay_date,
       amount_per_share = excluded.amount_per_share,
       currency = excluded.currency,
       shares = excluded.shares,
       total_amount = excluded.total_amount,
       note = excluded.note`,
    d.ticker,
    d.ex_date,
    d.pay_date,
    d.amount_per_share,
    d.currency,
    d.shares,
    total,
    d.source,
    d.note,
    new Date().toISOString(),
  );
  return (
    get<Dividend>('SELECT * FROM dividends WHERE id = ?', Number(info.lastInsertRowid)) ??
    get<Dividend>('SELECT * FROM dividends WHERE ticker = ? AND ex_date IS ? AND source = ?', d.ticker, d.ex_date, d.source)!
  );
}

export function deleteDividend(id: number): boolean {
  return run('DELETE FROM dividends WHERE id = ?', id).changes > 0;
}

export function hasAutoDividend(ticker: string, exDate: string): boolean {
  return (
    get<{ one: number }>(
      "SELECT 1 AS one FROM dividends WHERE ticker = ? AND ex_date = ? AND source = 'auto'",
      ticker,
      exDate,
    ) !== undefined
  );
}
