import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { api } from '../lib/api';
import { invalidate } from '../lib/useApi';
import { Pill } from './ui';
import type { Lot, SearchHit } from '../lib/types';

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

const ccyForMarket = (market: SearchHit['market']): string =>
  market === 'US' ? 'USD' : market === 'TWSE' || market === 'TPEx' ? 'TWD' : '';

/**
 * Add a holding. Two shapes:
 *  - `editing` → edit one manual lot (單筆 mode, toggle hidden)
 *  - neither   → add: user picks 單筆 or 定期定額 (`initialMode` seeds the pick).
 *               定期定額 does a one-shot backfill — it generates a dated lot per
 *               扣款日 from the start date to today, priced off that day's close.
 */
export function LotForm({
  open,
  onClose,
  editing,
  initialMode = 'single',
}: {
  open: boolean;
  onClose: () => void;
  editing?: { id: number; ticker: string; lot: Lot } | null;
  initialMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>('single');
  const [v, setV] = useState<LotFormValues>(empty);
  const [dca, setDca] = useState<DcaValues>(emptyDca);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
    } else {
      setMode(initialMode);
      setV(empty);
      setDca(emptyDca());
    }
  }, [open, editing, initialMode]);

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
    if (!ticker) {
      setErr('請輸入標的代號。');
      return;
    }
    if (schedule.length === 0 || schedule.some((r) => !(r.amount > 0))) {
      setErr('每個扣款日都需要一個大於 0 的金額。');
      return;
    }
    const body: Record<string, unknown> = {
      ticker,
      start_date: dca.start_date,
      end_date: dca.end_date || null,
      schedule,
      notes: dca.notes.trim() || null,
    };
    if (dca.currency.trim()) body.currency = dca.currency.trim().toUpperCase();
    const r = await api.post<{ lots_created: number; skipped: number }>('/portfolio/lots/dca', body);
    invalidate('/portfolio');
    invalidate('/watchlist');
    if (r.lots_created === 0) {
      setErr(
        r.skipped > 0
          ? '沒有新增任何持股 — 這些扣款日已有紀錄或尚無價格。'
          : '這個區間內沒有可產生的扣款日。',
      );
      return;
    }
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

  const title = editing ? 'Edit lot' : mode === 'dca' ? '新增定期定額' : 'Add holding lot';

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

        {!editing && (
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
            <TickerField
              label="Ticker"
              value={v.ticker}
              onChange={(ticker) => setV((s) => ({ ...s, ticker }))}
              onPickCurrency={(ccy) => setV((s) => ({ ...s, currency: s.currency || ccy }))}
              autoFocus={!editing}
            />
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
            <TickerField
              label="標的代號"
              value={dca.ticker}
              onChange={(ticker) => setDca((s) => ({ ...s, ticker }))}
              onPickCurrency={(ccy) => setDca((s) => ({ ...s, currency: s.currency || ccy }))}
              autoFocus
            />
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
              會用每個扣款日的收盤價，一次把開始日期到今天的持股補上（一筆一日）。
              下個月再開這個表單、把開始日期往後移即可；已有紀錄的扣款日會自動略過。
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
            {busy ? 'saving…' : editing ? 'save' : mode === 'dca' ? '產生持股' : 'add lot'}
          </button>
        </div>
        {!editing && (
          <p className="text-[11px] text-fg-muted">
            A ticker you don't track yet is added to the watchlist automatically.
          </p>
        )}
      </form>
    </div>
  );
}

/** Ticker input with a debounced stock-number / name typeahead. */
function TickerField({
  label,
  value,
  onChange,
  onPickCurrency,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (ticker: string) => void;
  onPickCurrency?: (ccy: string) => void;
  autoFocus?: boolean;
}) {
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [showHits, setShowHits] = useState(false);
  const [pickedName, setPickedName] = useState<string | null>(null);
  const typed = useRef(false); // only search after real keystrokes, not prefill / pick

  useEffect(() => {
    if (!typed.current) return;
    typed.current = false;
    const q = value.trim();
    if (q.length < 1) {
      setHits([]);
      setShowHits(false);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await api.get<{ results: SearchHit[] }>(
          `/watchlist/search?q=${encodeURIComponent(q)}`,
        );
        setHits(r.results);
        setShowHits(true);
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [value]);

  const pickHit = (h: SearchHit) => {
    typed.current = false;
    onChange(h.ticker);
    onPickCurrency?.(ccyForMarket(h.market));
    setPickedName(h.name ?? null);
    setHits([]);
    setShowHits(false);
  };

  return (
    <div className="block">
      <span className="u-label mb-1 block">{label}</span>
      <div className="relative">
        <input
          value={value}
          onChange={(e) => {
            typed.current = true;
            setPickedName(null);
            onChange(e.target.value);
          }}
          onFocus={() => hits.length > 0 && setShowHits(true)}
          onBlur={() => setTimeout(() => setShowHits(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && showHits && hits[0]) {
              e.preventDefault();
              pickHit(hits[0]);
            }
          }}
          placeholder="輸入代號或名稱 — 2330, 台積電, VOO…"
          className={inputCls}
          autoFocus={autoFocus}
          autoComplete="off"
        />
        {searching && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-fg-muted">…</span>
        )}
        {showHits && hits.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded border border-border bg-bg shadow-lg">
            {hits.map((h) => (
              <li key={h.ticker + h.source}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickHit(h)}
                  className={clsx(
                    'flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-surface',
                    value.toUpperCase() === h.ticker.toUpperCase() && 'bg-surface',
                  )}
                >
                  <span className="w-16 shrink-0 font-semibold text-accent">{h.ticker}</span>
                  <span className="min-w-0 flex-1 truncate text-fg-secondary">{h.name}</span>
                  <span className="shrink-0 text-[10px] uppercase text-fg-muted">{h.market}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {pickedName && !showHits && (
        <span className="mt-1 block truncate text-[11px] text-fg-muted">{pickedName}</span>
      )}
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
