/** 定期定額 (dollar-cost-averaging) plans. Lots are materialised from these on refresh. */
import { all, get, run } from '../db/index.js';

export interface ScheduleEntry {
  day: number; // 1..28 (day of month)
  amount: number; // per debit, in `currency`
}

export interface Plan {
  id: number;
  ticker: string;
  currency: string;
  start_date: string; // ISO yyyy-mm-dd
  end_date: string | null; // ISO or null = ongoing
  schedule: ScheduleEntry[];
  active: boolean;
  notes: string | null;
  last_run_date: string | null;
  created_at: string;
}

export type NewPlan = Omit<Plan, 'id' | 'created_at' | 'last_run_date'>;

interface PlanRow {
  id: number;
  ticker: string;
  currency: string;
  start_date: string;
  end_date: string | null;
  schedule: string;
  active: number;
  notes: string | null;
  last_run_date: string | null;
  created_at: string;
}

function hydrate(row: PlanRow): Plan {
  let schedule: ScheduleEntry[] = [];
  try {
    const v = JSON.parse(row.schedule);
    if (Array.isArray(v)) {
      schedule = v
        .map((e) => ({ day: Number(e.day), amount: Number(e.amount) }))
        .filter((e) => Number.isFinite(e.day) && Number.isFinite(e.amount));
    }
  } catch {
    /* leave empty */
  }
  return {
    id: row.id,
    ticker: row.ticker,
    currency: row.currency,
    start_date: row.start_date,
    end_date: row.end_date,
    schedule,
    active: row.active !== 0,
    notes: row.notes,
    last_run_date: row.last_run_date,
    created_at: row.created_at,
  };
}

export function listPlans(): Plan[] {
  return all<PlanRow>('SELECT * FROM dca_plans ORDER BY active DESC, ticker, id').map(hydrate);
}

export function getPlan(id: number): Plan | undefined {
  const row = get<PlanRow>('SELECT * FROM dca_plans WHERE id = ?', id);
  return row ? hydrate(row) : undefined;
}

export function listActive(): Plan[] {
  return all<PlanRow>('SELECT * FROM dca_plans WHERE active = 1 ORDER BY ticker, id').map(hydrate);
}

export function addPlan(plan: NewPlan): Plan {
  const info = run(
    `INSERT INTO dca_plans
       (ticker, currency, start_date, end_date, schedule, active, notes, last_run_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    plan.ticker,
    plan.currency,
    plan.start_date,
    plan.end_date,
    JSON.stringify(plan.schedule),
    plan.active ? 1 : 0,
    plan.notes,
    new Date().toISOString(),
  );
  return getPlan(Number(info.lastInsertRowid))!;
}

export interface PlanPatch {
  currency?: string;
  start_date?: string;
  end_date?: string | null;
  schedule?: ScheduleEntry[];
  active?: boolean;
  notes?: string | null;
}

export function updatePlan(id: number, patch: PlanPatch): Plan | undefined {
  const prev = getPlan(id);
  if (!prev) return undefined;
  const next = { ...prev, ...patch };
  run(
    `UPDATE dca_plans
       SET currency = ?, start_date = ?, end_date = ?, schedule = ?, active = ?, notes = ?
     WHERE id = ?`,
    next.currency,
    next.start_date,
    next.end_date,
    JSON.stringify(next.schedule),
    next.active ? 1 : 0,
    next.notes,
    id,
  );
  return getPlan(id);
}

export function deletePlan(id: number): boolean {
  return run('DELETE FROM dca_plans WHERE id = ?', id).changes > 0;
}

export function setLastRun(id: number, date: string): void {
  run('UPDATE dca_plans SET last_run_date = ? WHERE id = ?', date, id);
}
