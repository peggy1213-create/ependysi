import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useIndustryStocks, useRankings, useWatchlist } from '../lib/hooks';
import { addTicker } from '../lib/watchlistActions';
import { Async, Card, Pill } from '../components/ui';
import { compact, dirClass, money, nf, num, pct } from '../lib/format';
import type { InstRankRow, RankRow } from '../lib/types';

type Metric = 'change' | 'volume' | 'inst';
type IndustrySort = 'change' | 'volume' | 'turnover';
type View = 'movers' | 'volume' | 'inst' | 'industry';

const VIEWS: { key: View; label: string }[] = [
  { key: 'movers', label: '漲跌幅' },
  { key: 'volume', label: '熱門股' },
  { key: 'inst', label: '法人買超' },
  { key: 'industry', label: '產業選股' },
];

export default function Rankings() {
  const rankings = useRankings();
  const wl = useWatchlist();
  const watched = useMemo(
    () => new Set((wl.data?.items ?? []).map((i) => i.ticker)),
    [wl.data],
  );

  const [view, setView] = useState<View>('movers');
  const [code, setCode] = useState('');
  const [sort, setSort] = useState<IndustrySort>('change');
  const industry = useIndustryStocks(view === 'industry' && code ? code : null, sort);

  // Preselect a sensible industry (半導體業) the first time that tab is opened.
  useEffect(() => {
    if (view !== 'industry' || code) return;
    const list = rankings.data?.industries;
    if (!list || list.length === 0) return;
    setCode(list.some((i) => i.code === '24') ? '24' : list[0]!.code);
  }, [rankings.data, code, view]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-sm font-semibold uppercase tracking-widest text-fg-secondary">
          排行榜 · Rankings
        </h1>
        {rankings.data && (
          <span className="text-[11px] text-fg-muted">
            上市＋上櫃 · 買超交易日 {rankings.data.as_of}
          </span>
        )}
      </div>
      <p className="-mt-2 text-[11px] text-fg-muted">
        Tap <span className="text-accent">＋ Follow</span> on any row to add that stock to your watchlist.
      </p>

      <div className="flex flex-wrap gap-1">
        {VIEWS.map((v) => (
          <Pill key={v.key} active={view === v.key} onClick={() => setView(v.key)}>
            {v.label}
          </Pill>
        ))}
      </div>

      {view === 'movers' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="漲幅排行">
            <Async q={rankings}>
              {(d) => <RankList rows={d.gainers} metric="change" watched={watched} />}
            </Async>
          </Card>
          <Card title="跌幅排行">
            <Async q={rankings}>
              {(d) => <RankList rows={d.losers} metric="change" watched={watched} />}
            </Async>
          </Card>
        </div>
      )}

      {view === 'volume' && (
        <div className="lg:max-w-2xl">
          <Card title="熱門股排行 · 成交量">
            <Async q={rankings}>
              {(d) => <RankList rows={d.volume} metric="volume" watched={watched} />}
            </Async>
          </Card>
        </div>
      )}

      {view === 'inst' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="外資買超股 · 當日">
            <Async q={rankings}>
              {(d) => <RankList rows={d.foreign_buy} metric="inst" watched={watched} />}
            </Async>
          </Card>
          <Card title="投信買超股 · 當日">
            <Async q={rankings}>
              {(d) => <RankList rows={d.trust_buy} metric="inst" watched={watched} />}
            </Async>
          </Card>
        </div>
      )}

      {view === 'industry' && (
        <Card
          title="產業選股"
          action={
            rankings.data && rankings.data.industries.length > 0 ? (
              <select
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="rounded bg-surface px-2 py-1 text-xs text-fg-secondary outline-none"
              >
                {rankings.data.industries.map((i) => (
                  <option key={i.code} value={i.code}>
                    {i.name}（{i.count}）
                  </option>
                ))}
              </select>
            ) : null
          }
        >
          <div className="mb-2 flex gap-1">
            {(['change', 'volume', 'turnover'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={clsx(
                  'rounded px-2 py-0.5 text-[11px] transition-colors',
                  sort === s ? 'bg-accent text-bg' : 'bg-surface text-fg-secondary hover:text-fg',
                )}
              >
                {s === 'change' ? '漲跌幅' : s === 'volume' ? '成交量' : '成交值'}
              </button>
            ))}
          </div>
          <Async q={industry} empty="選擇產業以檢視成分股">
            {(d) => <RankList rows={d.stocks} metric="change" watched={watched} dense />}
          </Async>
        </Card>
      )}
    </div>
  );
}

function RankList({
  rows,
  metric,
  watched,
  dense,
}: {
  rows: (RankRow | InstRankRow)[];
  metric: Metric;
  watched: Set<string>;
  dense?: boolean;
}) {
  if (rows.length === 0) return <div className="p-2 text-xs text-fg-muted">—</div>;
  return (
    <ol className="divide-y divide-border/50">
      {rows.map((r, i) => (
        <RankRowLine
          key={r.ticker}
          rank={i + 1}
          row={r}
          metric={metric}
          watched={watched.has(r.ticker)}
          dense={dense}
        />
      ))}
    </ol>
  );
}

function RankRowLine({
  rank,
  row,
  metric,
  watched,
  dense,
}: {
  rank: number;
  row: RankRow | InstRankRow;
  metric: Metric;
  watched: boolean;
  dense?: boolean;
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  // `watched` comes from the live /watchlist query; addTicker invalidates it,
  // so a successful add flips this row to "✓ 追蹤中" on the next refetch.
  const isWatched = watched;

  const add = async () => {
    setState('busy');
    try {
      await addTicker(row.ticker);
      setState('idle');
    } catch (err) {
      // "already_watched" is a success from the user's point of view
      if (err instanceof Error && /already/i.test(err.message)) setState('idle');
      else setState('error');
    }
  };

  return (
    <li className={clsx('flex items-center gap-2', dense ? 'py-1' : 'py-1.5')}>
      <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-fg-muted">{rank}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-accent">{row.ticker}</span>
          {row.market === 'TPEx' && <span className="text-[9px] text-fg-muted">櫃</span>}
          {row.is_etf && <span className="text-[9px] text-fg-muted">ETF</span>}
        </div>
        <div className="truncate text-[11px] text-fg-secondary">{row.name}</div>
      </div>
      <div className="w-20 shrink-0 text-right leading-tight tabular-nums">
        <div className="text-sm text-fg">{num(row.price)}</div>
        <div className={clsx('text-[10px]', dirClass(row.change_pct))}>{pct(row.change_pct)}</div>
      </div>
      {metric !== 'change' && (
        <div className="w-24 shrink-0 text-right leading-tight tabular-nums">
          <Metric row={row} metric={metric} />
        </div>
      )}
      <button
        onClick={add}
        disabled={isWatched || state === 'busy'}
        title={
          isWatched
            ? 'Already on your watchlist'
            : state === 'error'
              ? 'Failed to add — click to retry'
              : `Add ${row.ticker} to watchlist`
        }
        className={clsx(
          'shrink-0 whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors',
          isWatched
            ? 'border-bullish/40 bg-bullish/10 text-bullish'
            : state === 'error'
              ? 'border-bearish/50 text-bearish hover:bg-bearish/10'
              : 'border-border text-fg-muted hover:border-accent hover:text-accent',
        )}
      >
        {isWatched
          ? '✓ Following'
          : state === 'busy'
            ? 'Adding…'
            : state === 'error'
              ? 'Retry'
              : '＋ Follow'}
      </button>
    </li>
  );
}

/** Right-hand column for the volume / institutional tabs (price is shown separately on every row). */
function Metric({ row, metric }: { row: RankRow | InstRankRow; metric: Metric }) {
  if (metric === 'volume') {
    return (
      <>
        <div className="text-sm text-fg">{compact(row.volume)}</div>
        <div className="text-[10px] text-fg-muted">{money(row.turnover, 'TWD', true)}</div>
      </>
    );
  }
  return (
    <div className="text-sm text-bullish">
      {nf((row as InstRankRow).net_lots, 0)}
      <span className="text-[10px] text-fg-muted"> 張</span>
    </div>
  );
}
