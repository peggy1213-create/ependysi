/**
 * One-shot 定期定額 backfill: turn a start date + monthly schedule of
 * {扣款日, 金額} into holding lots, pricing each with the Yahoo daily close on
 * (or just before) that date so `shares = 金額 ÷ close`.
 *
 * There is no stored plan — the caller re-runs this each period with the start
 * date moved forward. Debit dates that already have a lot for the same ticker
 * are skipped, so an overlapping re-run is safe.
 */
import type { Market } from '../config.js';
import { addLot, lotsForTicker } from '../repos/holdings.repo.js';
import type { Lot } from '../repos/holdings.repo.js';
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

function marketOf(ticker: string): Market {
  return (
    findByTicker(ticker)?.market ??
    (getQuote(ticker)?.market as Market | undefined) ??
    detectInstrument(ticker).market
  );
}

export interface DcaScheduleEntry {
  day: number; // 1..28
  amount: number;
}

export interface DcaParams {
  ticker: string;
  currency: string;
  start_date: string; // ISO yyyy-mm-dd
  end_date?: string | null; // ISO or null = up to today
  schedule: DcaScheduleEntry[];
  notes?: string | null;
}

export interface DcaResult {
  lots: Lot[];
  skipped: number; // debit dates already having a lot, or with no price yet
}

export async function generateDcaLots(p: DcaParams): Promise<DcaResult> {
  const today = todayIso();
  const until = p.end_date && p.end_date < today ? p.end_date : today;
  const dates = debitDates(
    p.start_date,
    until,
    p.schedule.map((s) => s.day),
  );
  if (dates.length === 0) return { lots: [], skipped: 0 };

  const amountByDay = new Map(p.schedule.map((s) => [s.day, s.amount]));
  const symbol = toYahooSymbol(p.ticker, marketOf(p.ticker));
  const closes = await yahoo.history(symbol, addDays(dates[0]!, -10), until);
  if (closes.length === 0) throw new Error(`no price history for ${p.ticker}`);

  const existing = new Set(lotsForTicker(p.ticker).map((l) => l.purchase_date));
  const lots: Lot[] = [];
  let skipped = 0;

  for (const date of dates) {
    if (existing.has(date)) {
      skipped += 1;
      continue;
    }
    const close = closeOnOrBefore(closes, date);
    const amount = amountByDay.get(Number(date.slice(8, 10)));
    if (close == null || close <= 0 || amount == null) {
      skipped += 1;
      continue;
    }
    lots.push(
      addLot({
        ticker: p.ticker,
        shares: amount / close,
        cost_basis: close,
        currency: p.currency,
        purchase_date: date,
        notes: p.notes ?? '定期定額',
        target_price: null,
        stop_loss: null,
      }),
    );
  }
  return { lots, skipped };
}
