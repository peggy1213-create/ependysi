import clsx from 'clsx';
import { useMarkets } from '../lib/hooks';
import { Async, Card } from '../components/ui';
import { num, pct } from '../lib/format';
import { dirClass } from '../lib/format';
import type { MarketQuote } from '../lib/types';

export default function Macro() {
  const markets = useMarkets();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="FX rates — TWD per unit">
        <Async q={markets}>
          {(m) => (
            <ul className="divide-y divide-border/60">
              {m.fx.map((q) => (
                <QuoteLine
                  key={q.ticker}
                  q={q}
                  dp={q.price != null && Math.abs(q.price) < 1 ? 4 : 2}
                  highlight={q.ticker === 'TWD=X'}
                />
              ))}
            </ul>
          )}
        </Async>
      </Card>

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
