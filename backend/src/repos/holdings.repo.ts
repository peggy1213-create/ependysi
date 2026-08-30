/** Portfolio holding lots + key/value settings. */
import { all, get, run } from '../db/index.js';

export interface Lot {
  id: number;
  ticker: string;
  shares: number;
  cost_basis: number; // per share, in `currency`
  currency: string;
  purchase_date: string | null;
  notes: string | null;
  target_price: number | null;
  stop_loss: number | null;
  created_at: string;
}

export type NewLot = Omit<Lot, 'id' | 'created_at'>;

export function listLots(): Lot[] {
  return all<Lot>('SELECT * FROM holding_lots ORDER BY ticker, purchase_date, id');
}

export function lotsForTicker(ticker: string): Lot[] {
  return all<Lot>(
    'SELECT * FROM holding_lots WHERE ticker = ? ORDER BY purchase_date, id',
    ticker,
  );
}

export function getLot(id: number): Lot | undefined {
  return get<Lot>('SELECT * FROM holding_lots WHERE id = ?', id);
}

export function heldTickers(): Set<string> {
  return new Set(
    all<{ ticker: string }>('SELECT DISTINCT ticker FROM holding_lots').map((r) => r.ticker),
  );
}

export function addLot(lot: NewLot): Lot {
  const info = run(
    `INSERT INTO holding_lots
       (ticker, shares, cost_basis, currency, purchase_date, notes, target_price, stop_loss, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    lot.ticker,
    lot.shares,
    lot.cost_basis,
    lot.currency,
    lot.purchase_date,
    lot.notes,
    lot.target_price,
    lot.stop_loss,
    new Date().toISOString(),
  );
  return getLot(Number(info.lastInsertRowid))!;
}

export function updateLot(id: number, patch: Partial<NewLot>): Lot | undefined {
  const prev = getLot(id);
  if (!prev) return undefined;
  const next = { ...prev, ...patch };
  run(
    `UPDATE holding_lots
     SET ticker = ?, shares = ?, cost_basis = ?, currency = ?, purchase_date = ?,
         notes = ?, target_price = ?, stop_loss = ?
     WHERE id = ?`,
    next.ticker,
    next.shares,
    next.cost_basis,
    next.currency,
    next.purchase_date,
    next.notes,
    next.target_price,
    next.stop_loss,
    id,
  );
  return getLot(id);
}

export function deleteLot(id: number): boolean {
  return run('DELETE FROM holding_lots WHERE id = ?', id).changes > 0;
}

// ── settings ───────────────────────────────────────────────────────────────
export function getSetting(key: string): string | undefined {
  return get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)?.value;
}

export function setSetting(key: string, value: string): void {
  run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

export function allSettings(): Record<string, string> {
  return Object.fromEntries(
    all<{ key: string; value: string }>('SELECT key, value FROM settings').map((r) => [
      r.key,
      r.value,
    ]),
  );
}
