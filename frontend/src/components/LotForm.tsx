import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { api } from '../lib/api';
import { invalidate } from '../lib/useApi';
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

  // ── ticker typeahead ───────────────────────────────────────────────────
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [showHits, setShowHits] = useState(false);
  const [pickedName, setPickedName] = useState<string | null>(null);
  const skipSearch = useRef(false);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setHits([]);
    setShowHits(false);
    skipSearch.current = true;
    if (editing) {
      const l = editing.lot;
      setPickedName(null);
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
      setPickedName(null);
      setV(empty);
    }
  }, [open, editing]);

  // Debounced search as the user types a stock number or name.
  useEffect(() => {
    if (!open) return;
    if (skipSearch.current) {
      skipSearch.current = false;
      return;
    }
    const q = v.ticker.trim();
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
  }, [v.ticker, open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const set = (k: keyof LotFormValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));

  const pickHit = (h: SearchHit) => {
    skipSearch.current = true;
    setV((s) => ({
      ...s,
      ticker: h.ticker,
      currency:
        s.currency ||
        (h.market === 'US' ? 'USD' : h.market === 'TWSE' || h.market === 'TPEx' ? 'TWD' : ''),
    }));
    setPickedName(h.name ?? null);
    setHits([]);
    setShowHits(false);
  };

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

        <div className="block">
          <span className="u-label mb-1 block">Ticker</span>
          <div className="relative">
            <input
              value={v.ticker}
              onChange={(e) => {
                setPickedName(null);
                set('ticker')(e);
              }}
              onFocus={() => hits.length > 0 && setShowHits(true)}
              onBlur={() => setTimeout(() => setShowHits(false), 120)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && showHits && hits[0]) {
                  e.preventDefault();
                  pickHit(hits[0]);
                }
              }}
              placeholder="Type a stock number or name — 2330, 台積電, VOO…"
              className={inputCls}
              autoFocus={!editing}
              autoComplete="off"
            />
            {searching && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-fg-muted">
                …
              </span>
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
                        v.ticker.toUpperCase() === h.ticker.toUpperCase() && 'bg-surface',
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
