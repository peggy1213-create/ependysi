/** Price-alert events — target / stop-loss crossings on portfolio positions. */
import { all, get, run } from '../db/index.js';

export type AlertKind = 'target' | 'stop';

export interface PriceAlert {
  id: number;
  ticker: string;
  kind: AlertKind;
  threshold: number;
  price: number;
  currency: string | null;
  triggered_at: string;
  cleared_at: string | null;
  acked_at: string | null;
}

/** Most recent alert row for a (ticker, kind), or undefined if none yet. */
export function latestAlert(ticker: string, kind: AlertKind): PriceAlert | undefined {
  return get<PriceAlert>(
    'SELECT * FROM price_alerts WHERE ticker = ? AND kind = ? ORDER BY id DESC LIMIT 1',
    ticker,
    kind,
  );
}

export function insertAlert(a: {
  ticker: string;
  kind: AlertKind;
  threshold: number;
  price: number;
  currency: string | null;
}): PriceAlert {
  const info = run(
    `INSERT INTO price_alerts (ticker, kind, threshold, price, currency, triggered_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    a.ticker,
    a.kind,
    a.threshold,
    a.price,
    a.currency,
    new Date().toISOString(),
  );
  return get<PriceAlert>('SELECT * FROM price_alerts WHERE id = ?', Number(info.lastInsertRowid))!;
}

/** Mark an open alert as cleared so a future re-cross records a fresh event. */
export function clearAlert(id: number): void {
  run(
    'UPDATE price_alerts SET cleared_at = ? WHERE id = ? AND cleared_at IS NULL',
    new Date().toISOString(),
    id,
  );
}

export function listAlerts(opts: { limit?: number; unackedOnly?: boolean } = {}): PriceAlert[] {
  return all<PriceAlert>(
    `SELECT * FROM price_alerts
     ${opts.unackedOnly ? 'WHERE acked_at IS NULL' : ''}
     ORDER BY id DESC LIMIT ?`,
    opts.limit ?? 50,
  );
}

export function countUnacked(): number {
  return get<{ c: number }>('SELECT COUNT(*) AS c FROM price_alerts WHERE acked_at IS NULL')?.c ?? 0;
}

export function ackAlert(id: number): boolean {
  return (
    run(
      'UPDATE price_alerts SET acked_at = ? WHERE id = ? AND acked_at IS NULL',
      new Date().toISOString(),
      id,
    ).changes > 0
  );
}

export function ackAllAlerts(): number {
  return Number(
    run('UPDATE price_alerts SET acked_at = ? WHERE acked_at IS NULL', new Date().toISOString())
      .changes,
  );
}
