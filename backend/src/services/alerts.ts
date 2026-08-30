/**
 * Price-alert detection.
 *
 * Compares each priced portfolio position against its aggregated target_price /
 * stop_loss (as computed by services/portfolio.ts) and records a one-shot alert
 * when the price crosses. Once triggered, an alert for that (ticker, kind) stays
 * silent until the price moves back to the safe side, which re-arms it so a
 * later re-cross records a fresh alert.
 *
 * There is no background scheduler — this runs inside refreshAll() and the
 * portfolio refresh, i.e. only while the app is open.
 */
import { computePortfolio } from './portfolio.js';
import {
  latestAlert,
  insertAlert,
  clearAlert,
  countUnacked,
  type AlertKind,
  type PriceAlert,
} from '../repos/alerts.repo.js';

export interface AlertScanResult {
  triggered: PriceAlert[];
  rearmed: number;
  checked: number;
  unacked: number;
}

const isBreached = (kind: AlertKind, price: number, threshold: number): boolean =>
  kind === 'target' ? price >= threshold : price <= threshold;

export function detectAlerts(): AlertScanResult {
  const { positions } = computePortfolio();
  const triggered: PriceAlert[] = [];
  let rearmed = 0;
  let checked = 0;

  for (const p of positions) {
    if (p.price == null) continue;
    const rules: [AlertKind, number | null][] = [
      ['target', p.target_price],
      ['stop', p.stop_loss],
    ];
    for (const [kind, threshold] of rules) {
      if (threshold == null) continue;
      checked++;
      const last = latestAlert(p.ticker, kind);
      const armed = !last || last.cleared_at != null;
      const breached = isBreached(kind, p.price, threshold);

      if (breached && armed) {
        triggered.push(
          insertAlert({
            ticker: p.ticker,
            kind,
            threshold,
            price: p.price,
            currency: p.currency ?? null,
          }),
        );
      } else if (!breached && last && last.cleared_at == null) {
        clearAlert(last.id);
        rearmed++;
      }
    }
  }

  return { triggered, rearmed, checked, unacked: countUnacked() };
}
