import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { useWatchlist } from '../lib/hooks';
import { Async, Card } from '../components/ui';
import { dateShort, daysUntil, num, pct } from '../lib/format';
import { dirClass } from '../lib/format';
import type { WatchItem } from '../lib/types';

export default function EtfCenter() {
  const wl = useWatchlist();
  const [compare, setCompare] = useState<string[]>([]);

  const { twEtfs, usEtfs } = useMemo(() => {
    const items = wl.data?.items ?? [];
    return {
      twEtfs: items.filter((i) => i.type === 'tw_etf'),
      usEtfs: items.filter((i) => i.type === 'us_etf'),
    };
  }, [wl.data]);

  const bondAlerts = useMemo(
    () =>
      twEtfs.filter(
        (e) => /B$/.test(e.ticker) && e.premium_discount_pct != null && Math.abs(e.premium_discount_pct) >= 0.5,
      ),
    [twEtfs],
  );

  const toggleCompare = (t: string) =>
    setCompare((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : prev.length >= 3 ? prev : [...prev, t],
    );

  const compareItems = (wl.data?.items ?? []).filter((i) => compare.includes(i.ticker));

  return (
    <div className="space-y-4">
      {bondAlerts.length > 0 && (
        <Card title="⚠ Bond ETF premium / discount alerts">
          <ul className="space-y-1 text-sm">
            {bondAlerts.map((e) => (
              <li key={e.id} className="flex items-center gap-3">
                <span className="font-semibold text-accent">{e.ticker}</span>
                <span className="text-fg-secondary">{e.name}</span>
                <span className={clsx('ml-auto tnum', e.premium_discount_pct! > 0 ? 'text-bearish' : 'text-bullish')}>
                  {pct(e.premium_discount_pct)} {e.premium_discount_pct! > 0 ? 'premium' : 'discount'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {compareItems.length >= 2 && (
        <Card title={`Compare · ${compareItems.map((i) => i.ticker).join(' vs ')}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="[&_td]:px-3 [&_td]:py-1.5 [&_tr]:border-b [&_tr]:border-border/50">
                <CompareRow label="Price" items={compareItems} render={(i) => num(i.price)} />
                <CompareRow label="Change %" items={compareItems} render={(i) => <span className={dirClass(i.change_pct)}>{pct(i.change_pct)}</span>} />
                <CompareRow label="NAV" items={compareItems} render={(i) => num(i.nav)} />
                <CompareRow label="Prem/Disc" items={compareItems} render={(i) => (i.premium_discount_pct == null ? '—' : <span className={i.premium_discount_pct > 0 ? 'text-bearish' : 'text-bullish'}>{pct(i.premium_discount_pct)}</span>)} />
                <CompareRow label="Dividend yield" items={compareItems} render={(i) => (i.dividend_yield == null ? '—' : `${num(i.dividend_yield, 2)}%`)} />
                <CompareRow label="Expense ratio" items={compareItems} render={(i) => (i.expense_ratio == null ? '—' : `${num(i.expense_ratio, 3)}%`)} />
                <CompareRow label="Next ex-div" items={compareItems} render={(i) => dateShort(i.next_ex_dividend_date)} />
              </tbody>
            </table>
          </div>
          <button onClick={() => setCompare([])} className="mt-2 text-xs text-fg-muted hover:text-fg">
            clear
          </button>
        </Card>
      )}

      <Async q={wl} empty="No ETFs on the watchlist yet.">
        {() => (
          <>
            <Card title={`Taiwan ETFs · ${twEtfs.length}`} pad={false}>
              <EtfTable
                items={twEtfs}
                columns={['nav', 'pd', 'yield', 'exdiv']}
                compare={compare}
                onCompare={toggleCompare}
              />
            </Card>
            <Card title={`US ETFs · ${usEtfs.length}`} pad={false}>
              <EtfTable
                items={usEtfs}
                columns={['yield', 'expense', 'exdiv']}
                compare={compare}
                onCompare={toggleCompare}
              />
            </Card>
          </>
        )}
      </Async>
    </div>
  );
}

function CompareRow({
  label,
  items,
  render,
}: {
  label: string;
  items: WatchItem[];
  render: (i: WatchItem) => React.ReactNode;
}) {
  return (
    <tr>
      <td className="u-label">{label}</td>
      {items.map((i) => (
        <td key={i.id} className="tnum">
          {render(i)}
        </td>
      ))}
    </tr>
  );
}

type Col = 'nav' | 'pd' | 'yield' | 'expense' | 'exdiv';

function EtfTable({
  items,
  columns,
  compare,
  onCompare,
}: {
  items: WatchItem[];
  columns: Col[];
  compare: string[];
  onCompare: (t: string) => void;
}) {
  if (items.length === 0) return <div className="p-4 text-xs text-fg-muted">none</div>;
  const heads: Record<Col, string> = {
    nav: 'NAV',
    pd: 'Prem/Disc',
    yield: 'Yield',
    expense: 'Expense',
    exdiv: 'Next ex-div',
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-[10px] uppercase tracking-wider text-fg-muted [&>th]:px-3 [&>th]:py-2 [&>th]:text-right [&>th]:font-normal [&>th:first-child]:text-left [&>th:nth-child(2)]:text-left">
            <th>Ticker</th>
            <th>Name</th>
            <th>Price</th>
            <th>Chg%</th>
            {columns.map((c) => (
              <th key={c}>{heads[c]}</th>
            ))}
            <th>±</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const dleft = daysUntil(it.next_ex_dividend_date);
            return (
              <tr
                key={it.id}
                className="border-b border-border/50 last:border-0 hover:bg-surface [&>td]:px-3 [&>td]:py-1.5 [&>td]:text-right [&>td:first-child]:text-left [&>td:nth-child(2)]:text-left"
              >
                <td className="font-semibold text-accent">
                  {it.ticker}
                  {it.in_portfolio && ' 💼'}
                </td>
                <td className="max-w-[160px] truncate text-fg-secondary">{it.name}</td>
                <td className="tnum">{num(it.price)}</td>
                <td className={`tnum ${dirClass(it.change_pct)}`}>{pct(it.change_pct)}</td>
                {columns.map((c) => (
                  <td key={c} className="tnum">
                    {c === 'nav' && num(it.nav)}
                    {c === 'pd' &&
                      (it.premium_discount_pct == null ? (
                        '—'
                      ) : (
                        <span className={it.premium_discount_pct > 0 ? 'text-bearish' : 'text-bullish'}>
                          {pct(it.premium_discount_pct)}
                        </span>
                      ))}
                    {c === 'yield' && (it.dividend_yield == null ? '—' : `${num(it.dividend_yield, 2)}%`)}
                    {c === 'expense' && (it.expense_ratio == null ? '—' : `${num(it.expense_ratio, 3)}%`)}
                    {c === 'exdiv' &&
                      (it.next_ex_dividend_date ? (
                        <span className={dleft != null && dleft <= 7 ? 'text-highlight' : ''}>
                          {dateShort(it.next_ex_dividend_date)}
                          {dleft != null && dleft >= 0 && <span className="text-fg-muted"> ({dleft}d)</span>}
                        </span>
                      ) : (
                        '—'
                      ))}
                  </td>
                ))}
                <td>
                  <button
                    onClick={() => onCompare(it.ticker)}
                    className={clsx(
                      'rounded px-1.5 text-xs',
                      compare.includes(it.ticker) ? 'bg-accent text-bg' : 'text-fg-muted hover:text-fg',
                    )}
                  >
                    {compare.includes(it.ticker) ? '✓' : '+'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
