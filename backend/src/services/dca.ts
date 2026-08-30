/**
 * Materialise 定期定額 plans into holding lots.
 *
 * For each due 扣款日 we look up the Yahoo daily close on (or just before) that
 * date and create a lot with shares = 金額 ÷ close. Idempotent: a plan carries a
 * `last_run_date` cursor and we also guard against a duplicate (plan_id, date).
 * Runs on every refresh (there is no background scheduler) and once at plan
 * creation.
 */
import type { Market } from '../config.js';
import { addLot, lotsByPlan } from '../repos/holdings.repo.js';
import { listActive, setLastRun } from '../repos/dcaPlans.repo.js';
import type { Plan } from '../repos/dcaPlans.repo.js';
import { findByTicker } from '../repos/watchlist.repo.js';
import { getQuote } from '../repos/quotes.repo.js';
import { detectInstrument, toYahooSymbol } from '../lib/ticker.js';
import * as yahoo from './yahoo.js';
import type { DailyClose } from './yahoo.js';

const todayIso = (): string => new Date().toISOString().slice(0, 10);

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** All `YYYY-MM-DD` debit dates in [from, to] for the given days-of-month (1..28). */
function debitDates(from: string, to: string, days: number[]): string[] {
  if (from > to) return [];
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7)); // 1..12
  const endY = Number(to.slice(0, 4));
  const endM = Number(to.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    for (const day of days) {
      const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (iso >= from && iso <= to) out.push(iso);
    }
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return [...new Set(out)].sort();
}

/** Last close on or before `date`; null if none in the series. */
function closeOnOrBefore(closes: DailyClose[], date: string): number | null {
  let hit: number | null = null;
  for (const c of closes) {
    if (c.date <= date) hit = c.close;
    else break;
  }
  return hit;
}

/** Next scheduled 扣款日 strictly after today, bounded by end_date; null if the plan is finished. */
export function nextDebitDate(plan: Plan): string | null {
  if (!plan.active || plan.schedule.length === 0) return null;
  const today = todayIso();
  const horizon = addDays(today, 400);
  const cap = plan.end_date && plan.end_date < horizon ? plan.end_date : horizon;
  const start = plan.start_date > today ? plan.start_date : addDays(today, 1);
  return (
    debitDates(
      start,
      cap,
      plan.schedule.map((s) => s.day),
    )[0] ?? null
  );
}

function marketOf(ticker: string): Market {
  return (
    findByTicker(ticker)?.market ??
    (getQuote(ticker)?.market as Market | undefined) ??
    detectInstrument(ticker).market
  );
}

export async function materializePlan(plan: Plan): Promise<{ created: number }> {
  if (plan.schedule.length === 0) return { created: 0 };
  const today = todayIso();
  const from = plan.last_run_date
    ? plan.start_date > addDays(plan.last_run_date, 1)
      ? plan.start_date
      : addDays(plan.last_run_date, 1)
    : plan.start_date;
  const until = plan.end_date && plan.end_date < today ? plan.end_date : today;

  const dates = debitDates(
    from,
    until,
    plan.schedule.map((s) => s.day),
  );
  if (dates.length === 0) return { created: 0 };

  const amountByDay = new Map(plan.schedule.map((s) => [s.day, s.amount]));
  const symbol = toYahooSymbol(plan.ticker, marketOf(plan.ticker));
  const closes = await yahoo.history(symbol, addDays(dates[0]!, -10), today);
  if (closes.length === 0) return { created: 0 };

  const existing = new Set(lotsByPlan(plan.id).map((l) => l.purchase_date));
  let created = 0;
  let lastDate: string | null = null;

  for (const date of dates) {
    if (existing.has(date)) {
      lastDate = date;
      continue;
    }
    const close = closeOnOrBefore(closes, date);
    if (close == null || close <= 0) continue; // future / no data — retry next refresh
    const day = Number(date.slice(8, 10));
    const amount = amountByDay.get(day);
    if (amount == null) continue;
    addLot({
      ticker: plan.ticker,
      shares: amount / close,
      cost_basis: close,
      currency: plan.currency,
      purchase_date: date,
      notes: plan.notes ?? '定期定額',
      target_price: null,
      stop_loss: null,
      plan_id: plan.id,
    });
    created += 1;
    lastDate = date;
  }

  if (lastDate && (!plan.last_run_date || lastDate > plan.last_run_date)) {
    setLastRun(plan.id, lastDate);
  }
  return { created };
}

export async function materializeDuePlans(): Promise<{ plans: number; lotsCreated: number }> {
  const plans = listActive();
  let lotsCreated = 0;
  for (const plan of plans) {
    try {
      lotsCreated += (await materializePlan(plan)).created;
    } catch {
      /* skip this plan; retried next refresh */
    }
  }
  return { plans: plans.length, lotsCreated };
}
