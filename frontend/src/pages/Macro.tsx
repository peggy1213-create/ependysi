import { useMemo } from 'react';
import clsx from 'clsx';
import { useMarkets, useWatchlist } from '../lib/hooks';
import { Async, Card } from '../components/ui';
import { num, pct } from '../lib/format';
import { dirClass } from '../lib/format';
import type { MarketQuote } from '../lib/types';

export default function Macro() {
  const markets = useMarkets();
  const wl = useWatchlist();

  const crypto = useMemo(
    () => (wl.data?.items ?? []).filter((i) => i.type === 'crypto'),
    [wl.data],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="FX rates">
          <Async q={markets}>
            {(m) => (
              <ul className="divide-y divide-border/60">
                {m.fx.map((q) => (
                  <QuoteLine key={q.ticker} q={q} dp={q.ticker === 'DX-Y.NYB' ? 2 : 4} highlight={q.ticker === 'TWD=X'} />
                ))}
              </ul>
            )}
          </Async>
        </Card>

        <Card title="Bond yields">
          <div className="space-y-2 text-sm">
            <PendingRow label="US 10Y (DGS10)" />
            <PendingRow label="US 2Y (DGS2)" />
            <PendingRow label="10Y–2Y spread" />
            <p className="pt-2 text-[11px] text-fg-muted">
              Wire <code>/api/macro/yields</code> (FRED) — needs <code>FRED_API_KEY</code>.
            </p>
          </div>
        </Card>
      </div>

      <Card title="Central bank rates">
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            { name: 'Fed Funds', code: 'FEDFUNDS' },
            { name: 'CBC (央行)', code: 'TW' },
            { name: 'ECB', code: 'ECB' },
          ].map((b) => (
            <div key={b.code} className="rounded border border-border/60 bg-bg/40 p-3">
              <div className="u-label">{b.name}</div>
              <div className="mt-1 text-lg text-fg-muted">—</div>
              <span className="inline-flex rounded bg-border px-1.5 py-0.5 text-[10px] text-fg-muted">
                hold / cut / hike — pending
              </span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Commodities">
          <Async q={markets}>
            {(m) => (
              <ul className="divide-y divide-border/60">
                {m.commodities.map((q) => (
                  <QuoteLine key={q.ticker} q={q} />
                ))}
              </ul>
            )}
          </Async>
        </Card>

        <Card title="Crypto (from watchlist)">
          {crypto.length ? (
            <ul className="divide-y divide-border/60">
              {crypto.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-fg-secondary">
                    <span className="font-semibold text-accent">{c.ticker}</span> {c.name}
                  </span>
                  <span className="tnum">
                    {num(c.price)} <span className={dirClass(c.change_pct)}>{pct(c.change_pct)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-fg-muted">Add a crypto ticker (e.g. BTC-USD) via the + button.</div>
          )}
        </Card>
      </div>
    </div>
  );
}

function QuoteLine({ q, dp = 2, highlight }: { q: MarketQuote; dp?: number; highlight?: boolean }) {
  return (
    <li className={clsx('flex items-center justify-between py-2 text-sm', highlight && '-mx-4 bg-accent/8 px-4')}>
      <span className={clsx('text-fg-secondary', highlight && 'font-semibold text-fg')}>{q.name}</span>
      <span className="tnum">
        {num(q.price, dp)} <span className={dirClass(q.change_pct)}>{pct(q.change_pct)}</span>
      </span>
    </li>
  );
}

function PendingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-fg-secondary">{label}</span>
      <span className="text-fg-muted">—</span>
    </div>
  );
}
