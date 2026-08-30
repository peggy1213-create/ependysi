/** Portfolio holdings + key/value settings. */
import { all, get, run } from '../db/index.js';

export interface Holding {
  id: number;
  ticker: string;
  quantity: number;
  cost_basis: number;
  currency: string;
  note: string | null;
  opened_at: string | null;
}

export function listHoldings(): Holding[] {
  return all<Holding>('SELECT * FROM holdings ORDER BY ticker');
}

export function heldTickers(): Set<string> {
  return new Set(all<{ ticker: string }>('SELECT DISTINCT ticker FROM holdings').map((r) => r.ticker));
}

export function addHolding(h: Omit<Holding, 'id'>): Holding {
  const info = run(
    `INSERT INTO holdings (ticker, quantity, cost_basis, currency, note, opened_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    h.ticker,
    h.quantity,
    h.cost_basis,
    h.currency,
    h.note,
    h.opened_at,
  );
  return get<Holding>('SELECT * FROM holdings WHERE id = ?', Number(info.lastInsertRowid))!;
}

export function updateHolding(id: number, patch: Partial<Omit<Holding, 'id'>>): Holding | undefined {
  const prev = get<Holding>('SELECT * FROM holdings WHERE id = ?', id);
  if (!prev) return undefined;
  const next = { ...prev, ...patch };
  run(
    `UPDATE holdings SET ticker = ?, quantity = ?, cost_basis = ?, currency = ?, note = ?, opened_at = ?
     WHERE id = ?`,
    next.ticker,
    next.quantity,
    next.cost_basis,
    next.currency,
    next.note,
    next.opened_at,
    id,
  );
  return get<Holding>('SELECT * FROM holdings WHERE id = ?', id);
}

export function deleteHolding(id: number): boolean {
  return run('DELETE FROM holdings WHERE id = ?', id).changes > 0;
}

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
  const rows = all<{ key: string; value: string }>('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
