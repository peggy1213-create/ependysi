import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { invalidate } from '../lib/useApi';
import { Pill } from './ui';
import type { DcaPlan, Lot } from '../lib/types';

export interface LotFormValues {
  ticker: string;
  shares: string;
  cost_basis: string;
  currency: string;
  purchase_date: string;
  notes: string;
  target_price: string;
  stop_loss: string;
}

const empty: LotFormValues = {
  ticker: '',
  shares: '',
  cost_basis: '',
  currency: '',
  purchase_date: '',
  notes: '',
  target_price: '',
  stop_loss: '',
};

type Mode = 'single' | 'dca';

interface DcaRow {
  day: string;
  amount: string;
}
interface DcaValues {
  ticker: string;
  currency: string;
  start_date: string;
  end_date: string;
  notes: string;
  rows: DcaRow[];
}

const firstOfMonth = (): string => new Date().toISOString().slice(0, 8) + '01';

const emptyDca = (): DcaValues => ({
  ticker: '',
  currency: '',
  start_date: firstOfMonth(),
  end_date: '',
  notes: '',
  rows: [{ day: '6', amount: '' }],
});

/**
 * Add / edit a holding. Three shapes:
 *  - `editing`      → edit one manual lot (single mode, toggle hidden)
 *  - `planEditing`  → edit a 定期定額 plan (dca mode, toggle hidden)
 *  - neither        → add: user picks 單筆 or 定期定額 (`initialMode` seeds the pick)
 */
export function LotForm({
  open,
  onClose,
  editing,
  planEditing,
  initialMode = 'single',
}: {
  open: boolean;
  onClose: () => void;
  editing?: { id: number; ticker: string; lot: Lot } | null;
  planEditing?: DcaPlan | null;
  initialMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>('single');
  const [v, setV] = useState<LotFormValues>(empty);
  const [dca, setDca] = useState<DcaValues>(emptyDca);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const lockedToggle = !!editing || !!planEditing;

  useEffect(() => {
    if (!open) return;
    setErr(null);
    if (editing) {
      setMode('single');
      const l = editing.lot;
      setV({
        ticker: editing.ticker,
        shares: String(l.shares),
        cost_basis: String(l.cost_basis),
        currency: l.currency ?? '',
        purchase_date: l.purchase_date ?? '',
        notes: l.notes ?? '',
        target_price: l.target_price != null ? String(l.target_price) : '',
        stop_loss: l.stop_loss != null ? String(l.stop_loss) : '',
      });
    } else if (planEditing) {
      setMode('dca');
      setDca({
        ticker: planEditing.ticker,
        currency: planEditing.currency ?? '',
        start_date: planEditing.start_date,
        end_date: planEditing.end_date ?? '',
        notes: planEditing.notes ?? '',
        rows: planEditing.schedule.length
          ? planEditing.schedule.map((s) => ({ day: String(s.day), amount: String(s.amount) }))
          : [{ day: '6', amount: '' }],
      });
    } else {
      setMode(initialMode);
      setV(empty);
      setDca(emptyDca());
    }
  }, [open, editing, planEditing, initialMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const set = (k: keyof LotFormValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));
  const setD = (k: keyof Omit<DcaValues, 'rows'>) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDca((s) => ({ ...s, [k]: e.target.value }));
  const setRow = (i: number, k: keyof DcaRow, value: string) =>
    setDca((s) => ({ ...s, rows: s.rows.map((r, j) => (j === i ? { ...r, [k]: value } : r)) }));
  const addRow = () =>
    setDca((s) => ({ ...s, rows: [...s.rows, { day: '16', amount: s.rows.at(-1)?.amount ?? '' }] }));
  const removeRow = (i: number) =>
    setDca((s) => ({ ...s, rows: s.rows.filter((_, j) => j !== i) }));

  const submitLot = async () => {
    const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));
    const body: Record<string, unknown> = {
      ticker: v.ticker.trim().toUpperCase(),
      shares: Number(v.shares),
      cost_basis: Number(v.cost_basis),
      purchase_date: v.purchase_date || null,
      notes: v.notes.trim() || null,
      target_price: numOrNull(v.target_price),
      stop_loss: numOrNull(v.stop_loss),
    };
    if (v.currency.trim()) body.currency = v.currency.trim().toUpperCase();
    if (!body.ticker || !Number.isFinite(body.shares) || body.shares === 0) {
      setErr('Ticker and a non-zero share count are required.');
      return;
    }
    if (editing) await api.put(`/portfolio/lots/${editing.id}`, body);
    else await api.post('/portfolio/lots', body);
    invalidate('/portfolio');
    invalidate('/watchlist');
    onClose();
  };

  const submitDca = async () => {
    const schedule = dca.rows
      .map((r) => ({ day: Number(r.day), amount: Number(r.amount) }))
      .filter((r) => Number.isInteger(r.day) && r.day >= 1 && r.day <= 28);
    const ticker = dca.ticker.trim().toUpperCase();
    if (!planEditing && !ticker) {
      setErr('請輸入標的代號。');
      return;
    }
    if (schedule.length === 0 || schedule.some((r) => !(r.amount > 0))) {
      setErr('每個扣款日都需要一個大於 0 的金額。');
      return;
    }
    const body: Record<string, unknown> = {
      start_date: dca.start_date,
      end_date: dca.end_date || null,
      schedule,
      notes: dca.notes.trim() || null,
    };
    if (dca.currency.trim()) body.currency = dca.currency.trim().toUpperCase();
    if (planEditing) {
      await api.put(`/portfolio/plans/${planEditing.id}`, body);
    } else {
      body.ticker = ticker;
      await api.post('/portfolio/plans', body);
    }
    invalidate('/portfolio');
    invalidate('/watchlist');
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await (mode === 'dca' ? submitDca() : submitLot());
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'failed');
    } finally {
      setBusy(false);
    }
  };

  const title = editing
    ? 'Edit lot'
    : planEditing
      ? '編輯定期定額'
      : mode === 'dca'
        ? '新增定期定額'
        : 'Add holding lot';

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-bg/70 p-4 pt-[8vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="u-card w-full max-w-md space-y-3 p-5"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          <button type="button" onClick={onClose} className="text-fg-muted hover:text-fg">
            ✕
          </button>
        </div>

        {!lockedToggle && (
          <div className="flex gap-1.5">
            <Pill
              active={mode === 'single'}
              onClick={() => {
                setErr(null);
                setMode('single');
              }}
            >
              單筆
            </Pill>
            <Pill
              active={mode === 'dca'}
              onClick={() => {
                setErr(null);
                setMode('dca');
              }}
            >
              定期定額
            </Pill>
          </div>
        )}

        {mode === 'single' ? (
          <>
            <Field label="Ticker">
              <input
                value={v.ticker}
                onChange={set('ticker')}
                placeholder="2330, VOO, AAPL…"
                className={inputCls}
                autoFocus={!editing}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Shares">
                <input type="number" step="any" value={v.shares} onChange={set('shares')} className={inputCls} />
              </Field>
              <Field label="Cost / share">
                <input type="number" step="any" value={v.cost_basis} onChange={set('cost_basis')} className={inputCls} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Currency (blank = auto)">
                <input value={v.currency} onChange={set('currency')} placeholder="TWD / USD" className={inputCls} />
              </Field>
              <Field label="Purchase date">
                <input type="date" value={v.purchase_date} onChange={set('purchase_date')} className={inputCls} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Target price">
                <input type="number" step="any" value={v.target_price} onChange={set('target_price')} className={inputCls} />
              </Field>
              <Field label="Stop loss">
                <input type="number" step="any" value={v.stop_loss} onChange={set('stop_loss')} className={inputCls} />
              </Field>
            </div>
            <Field label="Notes">
              <input value={v.notes} onChange={set('notes')} className={inputCls} />
            </Field>
          </>
        ) : (
          <>
            {!planEditing && (
              <Field label="標的代號">
                <input
                  value={dca.ticker}
                  onChange={setD('ticker')}
                  placeholder="0050, 00878, VT…"
                  className={inputCls}
                  autoFocus
                />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Field label="開始日期">
                <input type="date" value={dca.start_date} onChange={setD('start_date')} className={inputCls} />
              </Field>
              <Field label="結束日期（空白 = 進行中）">
                <input type="date" value={dca.end_date} onChange={setD('end_date')} className={inputCls} />
              </Field>
            </div>

            <div>
              <span className="u-label mb-1 block">每月扣款日與金額</span>
              <div className="space-y-1.5">
                {dca.rows.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={r.day}
                      onChange={(e) => setRow(i, 'day', e.target.value)}
                      className={`${rowInputCls} w-20 shrink-0`}
                    >
                      {Array.from({ length: 28 }, (_, k) => k + 1).map((d) => (
                        <option key={d} value={d}>
                          {d} 號
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="any"
                      value={r.amount}
                      onChange={(e) => setRow(i, 'amount', e.target.value)}
                      placeholder="金額"
                      className={`${rowInputCls} min-w-0 flex-1`}
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      disabled={dca.rows.length === 1}
                      className="px-1.5 text-fg-muted hover:text-bearish disabled:opacity-30"
                      title="移除"
                    >
                      −
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addRow}
                className="mt-1.5 text-[11px] text-accent hover:underline"
              >
                ＋ 加一個扣款日
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label="幣別（空白 = 自動）">
                <input value={dca.currency} onChange={setD('currency')} placeholder="TWD / USD" className={inputCls} />
              </Field>
              <Field label="備註">
                <input value={dca.notes} onChange={setD('notes')} className={inputCls} />
              </Field>
            </div>
            <p className="text-[11px] text-fg-muted">
              系統會用每個扣款日的收盤價回補到今天的持股，之後每次重新整理自動新增。
            </p>
          </>
        )}

        {err && <div className="rounded bg-bearish/10 px-2 py-1 text-xs text-bearish">{err}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-xs text-fg-muted hover:text-fg">
            cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-accent px-4 py-1.5 text-xs font-medium text-bg disabled:opacity-50"
          >
            {busy ? 'saving…' : editing ? 'save' : planEditing ? '儲存' : mode === 'dca' ? '建立計畫' : 'add lot'}
          </button>
        </div>
        {!editing && !planEditing && (
          <p className="text-[11px] text-fg-muted">
            A ticker you don't track yet is added to the watchlist automatically.
          </p>
        )}
      </form>
    </div>
  );
}

const rowInputCls =
  'rounded border border-border bg-bg px-2 py-1.5 text-sm outline-none focus:border-accent placeholder:text-fg-muted';
const inputCls = `w-full ${rowInputCls}`;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="u-label mb-1 block">{label}</span>
      {children}
    </label>
  );
}
