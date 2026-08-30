import { useMemo } from 'react';
import { useMarketFlow, useMarkets, useWatchlist } from '../lib/hooks';
import { Async, Card } from '../components/ui';
import { FlowBars, Heatmap } from '../components/charts';
import { compact, num, pct } from '../lib/format';
import { dirClass } from '../lib/format';
import type { WatchItem } from '../lib/types';

export default function Taiwan() {
  const markets = useMarkets();
  const flow = useMarketFlow(10);
  const wl = useWatchlist();

  const twItems = useMemo(
    () => (wl.data?.items ?? []).filter((i) => i.market === 'TWSE' || i.market === 'TPEx'),
    [wl.data],
  );

  const sectorTiles = useMemo(() => {
    const stocks = twItems.filter((i) => i.type === 'stock' && i.sector);
    const map = new Map<string, { turnover: number; wChange: number }>();
    for (const s of stocks) {
      const turnover = (s.price ?? 0) * (s.volume ?? 0) || 1;
      const cur = map.get(s.sector!) ?? { turnover: 0, wChange: 0 };
      cur.turnover += turnover;
      cur.wChange += (s.change_pct ?? 0) * turnover;
      map.set(s.sector!, cur);
    }
    return [...map.entries()]
      .map(([label, v]) => ({ label, weight: v.turnover, change: v.turnover ? v.wChange / v.turnover : null }))
      .sort((a, b) => b.weight - a.weight);
  }, [twItems]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="TAIEX 加權指數">
          <Async q={markets}>
            {(m) => {
              const t = m.indices.find((i) => i.ticker === '^TWII');
              return t ? (
                <div>
                  <div className="flex items-baseline gap-3">
                    <span className={`text-3xl font-bold tnum glow ${dirClass(t.change_pct)}`}>{num(t.price, 2)}</span>
                    <span className={`tnum ${dirClass(t.change_pct)}`}>{pct(t.change_pct)}</span>
                  </div>
                  {t.volume != null && t.volume > 0 && (
                    <div className="mt-2 text-xs text-fg-muted">Volume {compact(t.volume)}</div>
                  )}
                </div>
              ) : (
                <span className="text-xs text-fg-muted">—</span>
              );
            }}
          </Async>
        </Card>

        <Card title="外資買賣超 (全市場)" className="lg:col-span-2">
          <Async q={flow} empty="No data">
            {(f) =>
              f.days.length ? (
                <FlowBars
                  values={f.days.map((d) => d.foreign_net)}
                  labels={f.days.map((d) => d.date.slice(5))}
                  unit="TWD daily net · 外資及陸資"
                />
              ) : (
                <div className="text-xs text-fg-muted">pending…</div>
              )
            }
          </Async>
        </Card>
      </div>

      <Card title="Sector heatmap — watched TW stocks (by turnover)">
        {sectorTiles.length ? (
          <Heatmap tiles={sectorTiles} />
        ) : (
          <div className="text-xs text-fg-muted">
            Add Taiwan stocks to the watchlist — sector data fills in on the next refresh.
          </div>
        )}
      </Card>

      <Card title={`Watched Taiwan stocks & ETFs · ${twItems.length}`} pad={false}>
        <Async q={wl}>
          {() => (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase tracking-wider text-fg-muted [&>th]:px-3 [&>th]:py-2 [&>th]:text-right [&>th]:font-normal [&>th:first-child]:text-left [&>th:nth-child(2)]:text-left">
                    <th>Ticker</th>
                    <th>Name</th>
                    <th>Price</th>
                    <th>Chg%</th>
                    <th>Vol</th>
                    <th>外資</th>
                    <th>Yield</th>
                    <th>Sector</th>
                  </tr>
                </thead>
                <tbody>
                  {twItems.map((it) => (
                    <TwRow key={it.id} it={it} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </Card>
    </div>
  );
}

function TwRow({ it }: { it: WatchItem }) {
  return (
    <tr className="border-b border-border/50 last:border-0 hover:bg-surface [&>td]:px-3 [&>td]:py-1.5 [&>td]:text-right [&>td:first-child]:text-left [&>td:nth-child(2)]:text-left">
      <td className="font-semibold text-accent">
        {it.ticker}
        {it.in_portfolio && ' 💼'}
      </td>
      <td className="max-w-[160px] truncate text-fg-secondary">{it.name}</td>
      <td className="tnum">{num(it.price)}</td>
      <td className={`tnum ${dirClass(it.change_pct)}`}>{pct(it.change_pct)}</td>
      <td className="tnum text-fg-muted">{compact(it.volume)}</td>
      <td className={`tnum ${dirClass(it.foreign_net)}`}>{it.foreign_net == null ? '—' : compact(it.foreign_net)}</td>
      <td className="tnum text-fg-secondary">{it.dividend_yield == null ? '—' : `${num(it.dividend_yield, 2)}%`}</td>
      <td className="text-xs text-fg-muted">{it.sector ?? '—'}</td>
    </tr>
  );
}
