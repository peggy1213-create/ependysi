import { Link } from 'react-router-dom';
import { useMarketFlow, useMarkets, usePortfolio } from '../lib/hooks';
import { Async, Card, Stat } from '../components/ui';
import { FlowBars, Gauge } from '../components/charts';
import { compact, money, num, pct } from '../lib/format';
import { dirClass } from '../lib/format';
import type { MarketQuote } from '../lib/types';

export default function Overview() {
  const markets = useMarkets();
  const pf = usePortfolio();
  const flow = useMarketFlow(5);

  return (
    <div className="space-y-4">
      {/* portfolio strip */}
      <Async q={pf} empty="No holdings yet — add some in Portfolio.">
        {(p) => (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Portfolio value" value={money(p.totals.market_value_twd)} sub={`${p.totals.positions} positions`} />
            <Stat
              label="Today's P&L"
              value={money(p.totals.day_pnl_twd)}
              accent={p.totals.day_pnl_twd >= 0 ? 'bull' : 'bear'}
            />
            <Stat
              label="Unrealized P&L"
              value={money(p.totals.unrealized_pnl_twd)}
              sub={pct(p.totals.unrealized_pnl_pct)}
              accent={p.totals.unrealized_pnl_twd >= 0 ? 'bull' : 'bear'}
            />
            <Stat label="Est. annual income" value={money(p.totals.est_annual_income_twd)} sub="dividends" />
          </div>
        )}
      </Async>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* TAIEX headline */}
        <Card title="TAIEX 加權指數">
          <Async q={markets}>
            {(m) => {
              const taiex = m.indices.find((i) => i.ticker === '^TWII');
              const tpex = m.indices.find((i) => i.ticker === '^TWOII');
              if (!taiex) return <div className="text-xs text-fg-muted">—</div>;
              return (
                <div>
                  <div className="flex items-baseline gap-3">
                    <span className={`text-3xl font-bold tnum glow ${dirClass(taiex.change_pct)}`}>
                      {num(taiex.price, 2)}
                    </span>
                    <span className={`tnum ${dirClass(taiex.change_pct)}`}>{pct(taiex.change_pct)}</span>
                  </div>
                  <div className="mt-2 flex gap-5 text-xs text-fg-muted">
                    {taiex.volume != null && taiex.volume > 0 && <span>Vol {compact(taiex.volume)}</span>}
                    {tpex && (
                      <span>
                        櫃買 <span className={dirClass(tpex.change_pct)}>{num(tpex.price, 2)} ({pct(tpex.change_pct)})</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            }}
          </Async>
        </Card>

        {/* global indices */}
        <Card title="Global indices" className="lg:col-span-2" action={<Link to="/macro" className="text-[10px] text-fg-muted hover:text-fg">macro →</Link>}>
          <Async q={markets}>
            {(m) => (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {m.indices
                  .filter((q) => q.ticker !== '^TWII' && q.ticker !== '^TWOII')
                  .map((q) => (
                    <IndexCard key={q.ticker} q={q} />
                  ))}
              </div>
            )}
          </Async>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* sentiment */}
        <Card title="Sentiment">
          <Async q={markets}>
            {(m) => {
              const vix = m.sentiment.find((s) => s.ticker === '^VIX');
              return (
                <div className="grid grid-cols-2 gap-2">
                  <Gauge value={vix?.price ?? null} min={10} max={45} label="VIX" invert />
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="text-lg font-semibold text-fg-muted">—</div>
                    <div className="u-label">Fear &amp; Greed</div>
                    <div className="mt-1 text-[10px] text-fg-muted">not wired</div>
                  </div>
                </div>
              );
            }}
          </Async>
        </Card>

        {/* foreign 5-day flow */}
        <Card title="外資買賣超 · 5-day (全市場)" className="lg:col-span-2">
          <Async q={flow} empty="No flow data yet.">
            {(f) => {
              const rows = f.days;
              const last = rows.at(-1);
              if (!last) return <div className="text-xs text-fg-muted">pending first fetch…</div>;
              return (
                <div>
                  <FlowBars
                    values={rows.map((d) => d.foreign_net)}
                    labels={rows.map((d) => d.date.slice(5))}
                    unit="TWD (bar = daily net)"
                  />
                  <div className="mt-2 text-xs">
                    Latest{' '}
                    <span className={dirClass(last.foreign_net)}>
                      {last.foreign_net != null && last.foreign_net >= 0 ? '+' : ''}
                      {compact(last.foreign_net)}
                    </span>{' '}
                    <span className="text-fg-muted">on {last.date}</span>
                  </div>
                </div>
              );
            }}
          </Async>
        </Card>
      </div>
    </div>
  );
}

function IndexCard({ q }: { q: MarketQuote }) {
  return (
    <div className="rounded border border-border/60 bg-bg/40 p-2.5">
      <div className="truncate text-xs text-fg-secondary">{q.name}</div>
      <div className="mt-1 text-lg font-semibold tnum">{num(q.price, 2)}</div>
      <div className={`text-xs tnum ${dirClass(q.change_pct)}`}>{pct(q.change_pct)}</div>
    </div>
  );
}
