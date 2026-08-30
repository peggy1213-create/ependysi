import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { invalidate } from '../lib/useApi';
import type { Lot } from '../lib/types';

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

/** Add or edit one holding lot. `editing` = the lot + its ticker to prefill for a PUT. */
export function LotForm({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing?: { id: number; ticker: string; lot: Lot } | null;
}) {
  const [v, setV] = useState<LotFormValues>(empty);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    if (editing) {
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
      setV(empty);
    }
  }, [open, editing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const set = (k: keyof LotFormValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
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
    setBusy(true);
    try {
      if (editing) await api.put(`/portfolio/lots/${editing.id}`, body);
      else await api.post('/portfolio/lots', body);
      invalidate('/portfolio');
      invalidate('/watchlist');
      onClose();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'failed');
    } finally {
      setBusy(false);
    }
  };

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
          <h2 className="text-sm font-semibold text-fg">{editing ? 'Edit lot' : 'Add holding lot'}</h2>
          <button type="button" onClick={onClose} className="text-fg-muted hover:text-fg">
            ✕
          </button>
        </div>

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
            {busy ? 'saving…' : editing ? 'save' : 'add lot'}
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

const inputCls =
  'w-full rounded border border-border bg-bg px-2 py-1.5 text-sm outline-none focus:border-accent placeholder:text-fg-muted';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="u-label mb-1 block">{label}</span>
      {children}
    </label>
  );
}
