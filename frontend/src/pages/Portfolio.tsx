import { Fragment, useState } from 'react';
import clsx from 'clsx';
import { useAllocation, useDividends, useOverlap, usePortfolio } from '../lib/hooks';
import { invalidate, useApi } from '../lib/useApi';
import { api } from '../lib/api';
import { Async, Badge, Card, RemoveButton, Stat } from '../components/ui';
import { Donut } from '../components/charts';
import { LotForm } from '../components/LotForm';
import { compact, dateShort, daysUntil, money, num, pct, shares } from '../lib/format';
import { dirClass } from '../lib/format';
import type { AllocationBucket, AllocationView, Lot, Position } from '../lib/types';

type LotModal =
  | { mode: 'add' }
  | { mode: 'edit'; id: number; ticker: string; lot: Lot }
  | null;

export default function Portfolio() {
  const pf = usePortfolio();
  const alloc = useAllocation();
  const overlap = useOverlap();
  const divs = useDividends();
  const settings = useApi<{ settings: Record<string, string> }>('/portfolio/settings');
  const [lotModal, setLotModal] = useState<LotModal>(null);
  const [divForm, setDivForm] = useState(false);

  const deleteLot = async (id: number) => {
    await api.del(`/portfolio/lots/${id}`);
    invalidate('/portfolio');
  };

  return (
    <div className="space-y-4">
      <Async q={pf}>
        {(p) => (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Total value" value={money(p.totals.market_value_twd)} sub={`cost ${money(p.totals.cost_twd, 'TWD', true)}`} />
              <Stat label="Unrealized P&L" value={money(p.totals.unrealized_pnl_twd)} sub={pct(p.totals.unrealized_pnl_pct)} accent={p.totals.unrealized_pnl_twd >= 0 ? 'bull' : 'bear'} />
              <Stat label="Today" value={money(p.totals.day_pnl_twd)} accent={p.totals.day_pnl_twd >= 0 ? 'bull' : 'bear'} />
              <Stat label="Est. income / yr" value={money(p.totals.est_annual_income_twd)} sub={`1 USD = ${num(p.fx.rates.USD ?? 0, 3)} TWD`} />
            </div>
            {p.totals.unpriced_tickers.length > 0 && (
              <div className="rounded border border-highlight/30 bg-highlight/10 px-3 py-1.5 text-xs text-highlight">
                No price for: {p.totals.unpriced_tickers.join(', ')} — try ↻ refresh
              </div>
            )}

            <Card
              title={`Holdings · ${p.totals.positions} positions, ${p.totals.lots} lots`}
              pad={false}
              action={
                <button
                  onClick={() => setLotModal({ mode: 'add' })}
                  className="rounded bg-accent px-2 py-1 text-[11px] font-medium text-bg"
                >
                  ＋ add lot
                </button>
              }
            >
              {p.positions.length === 0 ? (
                <div className="p-6 text-center text-xs text-fg-muted">
                  No holdings yet — click <span className="text-accent">＋ add lot</span>.
                </div>
              ) : (
                <HoldingsTable
                  positions={p.positions}
                  onEdit={(ticker, lot) => setLotModal({ mode: 'edit', id: lot.id, ticker, lot })}
                  onDelete={deleteLot}
                />
              )}
            </Card>
          </>
        )}
      </Async>

      {/* allocation */}
      <Async q={alloc}>
        {(a) => (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            <AllocCard title="By type" buckets={a.by_type} />
            <AllocCard title="By region" buckets={a.by_region} />
            <AllocCard title="By currency" buckets={a.by_currency} />
            <AllocCard title="By tag" buckets={a.by_tag} />
          </div>
        )}
      </Async>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* rebalancing */}
        <Rebalance
          alloc={alloc.data}
          totalTwd={pf.data?.totals.market_value_twd ?? 0}
          target={parseTarget(settings.data?.settings.target_allocation)}
        />

        {/* dividend calendar */}
        <Card
          title="Dividend calendar"
          action={
            <button
              onClick={() => setDivForm((v) => !v)}
              className="text-[11px] text-fg-muted hover:text-fg"
            >
              {divForm ? '× close' : '＋ log dividend'}
            </button>
          }
        >
          {divForm && <DividendForm onDone={() => setDivForm(false)} />}
          <Async q={divs}>
            {(d) => (
              <div className="space-y-3">
                <div className="text-sm">
                  Est. annual income{' '}
                  <span className="font-semibold text-bullish">{money(d.estimated_annual_income_twd)}</span>
                </div>
                {d.upcoming.length > 0 ? (
                  <ul className="space-y-1 text-sm">
                    {d.upcoming.map((u) => {
                      const dl = daysUntil(u.ex_date);
                      return (
                        <li key={u.ticker} className="flex items-center gap-2">
                          <span className="font-semibold text-accent">{u.ticker}</span>
                          <span className="text-fg-secondary">ex {dateShort(u.ex_date)}</span>
                          {dl != null && dl >= 0 && <Badge tone={dl <= 7 ? 'highlight' : 'muted'}>{dl}d</Badge>}
                          <span className="ml-auto tnum text-fg-muted">{money(u.est_annual_income_twd)}/yr</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="text-xs text-fg-muted">No upcoming ex-dividend dates in the cache.</div>
                )}
                {d.history.length > 0 && (
                  <div className="border-t border-border pt-2">
                    <div className="u-label mb-1">History · {money(d.history_total_twd)} total</div>
                    <ul className="space-y-0.5 text-xs">
                      {d.history.slice(0, 6).map((h) => (
                        <li key={h.id} className="flex justify-between">
                          <span className="text-fg-secondary">
                            {h.ticker} {dateShort(h.ex_date)}
                            {h.source === 'auto' && <span className="text-fg-muted"> ~est</span>}
                          </span>
                          <span className="tnum text-fg-muted">{money(h.total_amount_twd)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Async>
        </Card>
      </div>

      {/* overlap */}
      <Card title="Holdings overlap — direct + ETF look-through">
        <Async q={overlap}>
          {(o) => (
            <div className="space-y-3">
              {o.overlaps.length === 0 ? (
                <div className="text-xs text-fg-muted">
                  No underlyings held both directly and via an ETF.
                </div>
              ) : (
                <ul className="space-y-2">
                  {o.overlaps.map((f) => (
                    <li key={f.component_ticker} className="rounded border border-highlight/30 bg-highlight/8 p-2.5 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-accent">{f.component_ticker}</span>
                        <span className="text-fg-secondary">{f.component_name}</span>
                        <span className="ml-auto tnum">
                          effective <span className="font-semibold text-highlight">{num(f.effective_weight_pct, 1)}%</span>
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-fg-muted">
                        direct {num(f.direct_weight_pct, 1)}% + indirect {money(f.indirect_value_twd, 'TWD', true)} via{' '}
                        {f.via.map((v) => `${v.etf_ticker} (${num(v.weight_in_etf_pct, 1)}%)`).join(', ')}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {o.effective_exposure.length > 0 && (
                <div className="border-t border-border pt-2">
                  <div className="u-label mb-1">Top effective exposure (direct + look-through)</div>
                  <ul className="grid gap-x-6 gap-y-0.5 text-xs sm:grid-cols-2">
                    {o.effective_exposure.slice(0, 10).map((e) => (
                      <li key={e.ticker} className="flex justify-between">
                        <span className="text-fg-secondary">
                          {e.ticker} {e.held_directly ? '💼' : ''}
                        </span>
                        <span className="tnum text-fg-muted">{num(e.effective_weight_pct, 1)}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Async>
      </Card>

      <LotForm
        open={lotModal !== null}
        onClose={() => setLotModal(null)}
        editing={lotModal?.mode === 'edit' ? lotModal : null}
      />
    </div>
  );
}

// ── Holdings table with expandable lots ────────────────────────────────────
function HoldingsTable({
  positions,
  onEdit,
  onDelete,
}: {
  positions: Position[];
  onEdit: (ticker: string, lot: Lot) => void;
  onDelete: (id: number) => void | Promise<void>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (positions.length === 0) return <div className="p-4 text-xs text-fg-muted">no positions</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-[10px] uppercase tracking-wider text-fg-muted [&>th]:whitespace-nowrap [&>th]:px-3 [&>th]:py-2 [&>th]:text-right [&>th]:font-normal [&>th:first-child]:text-left">
            <th>Ticker</th>
            <th>Shares</th>
            <th>Avg cost</th>
            <th>Price</th>
            <th>Mkt value (TWD)</th>
            <th>Unrl. P&L</th>
            <th>Today</th>
            <th>Weight</th>
            <th>Target / Stop</th>
            <th> </th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <Fragment key={p.ticker}>
              <tr
                onClick={() => setOpen(open === p.ticker ? null : p.ticker)}
                className="cursor-pointer border-b border-border/50 hover:bg-surface [&>td]:px-3 [&>td]:py-1.5 [&>td]:text-right [&>td:first-child]:text-left"
              >
                <td className="whitespace-nowrap font-semibold">
                  <span className="text-fg-muted">{open === p.ticker ? '▾' : '▸'} </span>
                  <span className="text-accent">{p.ticker}</span>
                  {p.lots.length > 1 && (
                    <span className="ml-1.5 rounded bg-border px-1 text-[10px] font-normal text-fg-muted">
                      {p.lots.length} lots
                    </span>
                  )}
                </td>
                <td className="tnum">{shares(p.shares)}</td>
                <td className="tnum text-fg-muted">{p.avg_cost == null ? '—' : num(p.avg_cost)}</td>
                <td className="tnum">
                  {num(p.price)}
                  <span className={clsx('ml-1 text-xs', dirClass(p.change_pct))}>{pct(p.change_pct)}</span>
                </td>
                <td className="tnum">{money(p.market_value_twd)}</td>
                <td className={clsx('tnum', dirClass(p.unrealized_pnl_twd))}>
                  {money(p.unrealized_pnl_twd, 'TWD', true)}
                  <span className="ml-1 text-xs">{pct(p.unrealized_pnl_pct)}</span>
                </td>
                <td className={clsx('tnum text-xs', dirClass(p.day_pnl_twd))}>{money(p.day_pnl_twd, 'TWD', true)}</td>
                <td className="tnum text-fg-muted">{num(p.weight_pct, 1)}%</td>
                <td className="tnum text-xs">
                  {p.target_price ? (
                    <span className="text-bullish">{num(p.target_price)} ({pct(p.target_upside_pct)})</span>
                  ) : (
                    <span className="text-fg-muted">—</span>
                  )}
                  {' / '}
                  {p.stop_loss ? (
                    <span className="text-bearish">{num(p.stop_loss)}</span>
                  ) : (
                    <span className="text-fg-muted">—</span>
                  )}
                </td>
                <td />
              </tr>
              {open === p.ticker &&
                p.lots.map((l) => (
                  <tr key={l.id} className="group border-b border-border/30 bg-bg/40 text-xs [&>td]:px-3 [&>td]:py-1 [&>td]:text-right [&>td:first-child]:text-left [&>td:first-child]:pl-8">
                    <td className="text-fg-muted">{l.purchase_date ?? 'lot ' + l.id}</td>
                    <td className="tnum">{shares(l.shares)}</td>
                    <td className="tnum text-fg-muted">
                      {num(l.cost_basis)} {l.currency}
                    </td>
                    <td />
                    <td className="tnum">{money(l.market_value_twd)}</td>
                    <td className={clsx('tnum', dirClass(l.unrealized_pnl_twd))}>
                      {money(l.unrealized_pnl_twd, 'TWD', true)} {pct(l.unrealized_pnl_pct)}
                    </td>
                    <td colSpan={2} className="truncate text-left text-fg-muted">
                      {l.notes}
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => onEdit(p.ticker, l)}
                        className="opacity-50 transition-opacity hover:opacity-100 text-fg-muted hover:text-accent"
                        title="Edit lot"
                      >
                        edit
                      </button>
                    </td>
                    <td>
                      <span className="opacity-50 transition-opacity group-hover:opacity-100">
                        <RemoveButton onConfirm={() => onDelete(l.id)} label="delete" />
                      </span>
                    </td>
                  </tr>
                ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DividendForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ ticker: '', ex_date: '', amount_per_share: '', shares: '', currency: 'TWD', note: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!f.ticker.trim() || f.amount_per_share.trim() === '') {
      setErr('Ticker and amount per share are required.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/portfolio/dividends', {
        ticker: f.ticker.trim().toUpperCase(),
        ex_date: f.ex_date || null,
        amount_per_share: Number(f.amount_per_share),
        shares: f.shares.trim() === '' ? null : Number(f.shares),
        currency: f.currency.trim().toUpperCase() || 'TWD',
        note: f.note.trim() || null,
      });
      invalidate('/portfolio/dividends');
      onDone();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'failed');
    } finally {
      setBusy(false);
    }
  };

  const ic = 'rounded border border-border bg-bg px-2 py-1 text-xs outline-none focus:border-accent';
  return (
    <form onSubmit={submit} className="mb-3 space-y-2 rounded border border-border bg-bg/40 p-2.5">
      <div className="grid grid-cols-2 gap-2">
        <input value={f.ticker} onChange={set('ticker')} placeholder="ticker" className={ic} />
        <input type="date" value={f.ex_date} onChange={set('ex_date')} className={ic} />
        <input type="number" step="any" value={f.amount_per_share} onChange={set('amount_per_share')} placeholder="amount / share" className={ic} />
        <input type="number" step="any" value={f.shares} onChange={set('shares')} placeholder="shares (opt)" className={ic} />
        <input value={f.currency} onChange={set('currency')} placeholder="TWD" className={ic} />
        <input value={f.note} onChange={set('note')} placeholder="note (opt)" className={ic} />
      </div>
      {err && <div className="text-xs text-bearish">{err}</div>}
      <button disabled={busy} className="rounded bg-accent px-3 py-1 text-xs text-bg disabled:opacity-50">
        {busy ? 'saving…' : 'save dividend'}
      </button>
    </form>
  );
}

function AllocCard({ title, buckets }: { title: string; buckets: AllocationBucket[] }) {
  return (
    <Card title={title}>
      {buckets.length ? (
        <Donut data={buckets.map((b) => ({ label: b.label, value: b.value_twd }))} size={120} />
      ) : (
        <div className="text-xs text-fg-muted">—</div>
      )}
    </Card>
  );
}

// ── Rebalancing ───────────────────────────────────────────────────────────
interface Target {
  basis: 'by_type' | 'by_region' | 'by_currency' | 'by_tag';
  targets: Record<string, number>;
}
function parseTarget(raw: string | undefined): Target | null {
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as Target;
    return t.basis && t.targets ? t : null;
  } catch {
    return null;
  }
}

function Rebalance({
  alloc,
  totalTwd,
  target,
}: {
  alloc: AllocationView | undefined;
  totalTwd: number;
  target: Target | null;
}) {
  if (!target) {
    return (
      <Card title="Rebalancing">
        <div className="text-xs text-fg-muted">
          Set a target allocation in <span className="text-fg-secondary">Settings</span> to see drift and
          buy/sell suggestions.
        </div>
      </Card>
    );
  }
  const buckets = alloc?.[target.basis] ?? [];
  const current = new Map(buckets.map((b) => [b.label, b.weight_pct]));
  const rows = Object.entries(target.targets).map(([label, tgt]) => {
    const cur = current.get(label) ?? 0;
    const drift = cur - tgt;
    const deltaTwd = (-drift / 100) * totalTwd;
    return { label, tgt, cur, drift, deltaTwd };
  });
  return (
    <Card title={`Rebalancing · target ${target.basis.replace('by_', '')}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-fg-muted [&>th]:py-1 [&>th]:text-right [&>th:first-child]:text-left">
            <th>Bucket</th>
            <th>Target</th>
            <th>Current</th>
            <th>Drift</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-border/40 [&>td]:py-1.5 [&>td]:text-right [&>td:first-child]:text-left">
              <td className="text-fg-secondary">{r.label}</td>
              <td className="tnum">{num(r.tgt, 0)}%</td>
              <td className="tnum">{num(r.cur, 1)}%</td>
              <td className={clsx('tnum', dirClass(-r.drift))}>{pct(r.drift, 1)}</td>
              <td className={clsx('tnum text-xs', dirClass(r.deltaTwd))}>
                {Math.abs(r.deltaTwd) < totalTwd * 0.01
                  ? 'on target'
                  : `${r.deltaTwd > 0 ? 'buy' : 'sell'} ${compact(Math.abs(r.deltaTwd))}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
