import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { api } from '../lib/api';
import { invalidate } from '../lib/useApi';
import { useNews, useNewsAnalysis } from '../lib/hooks';
import { Async, Badge, Card, Pill, Spinner } from '../components/ui';
import { Markdown } from '../components/Markdown';
import { ago } from '../lib/format';
import type { NewsItem } from '../lib/types';

export default function News() {
  const news = useNews();
  const analysis = useNewsAnalysis();
  const [region, setRegion] = useState<'all' | 'global' | 'taiwan'>('all');
  const [analyzing, setAnalyzing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const items = useMemo(() => {
    const all = news.data?.items ?? [];
    return region === 'all' ? all : all.filter((i) => i.region === region);
  }, [news.data, region]);

  const aiEnabled = news.data?.ai_enabled ?? analysis.data?.ai_enabled ?? false;
  const latest = analysis.data?.analysis ?? null;

  const analyze = async () => {
    setAnalyzing(true);
    setErr(null);
    try {
      await api.post('/news/analyze', {});
      invalidate('/news/analysis');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {/* AI briefing */}
      <div className="lg:col-span-3">
        <Card
          title="AI market briefing"
          action={
            aiEnabled ? (
              <button
                onClick={analyze}
                disabled={analyzing}
                className="rounded bg-accent px-2.5 py-1 text-[11px] font-medium text-bg disabled:opacity-50"
              >
                {analyzing ? 'analysing…' : latest ? 'refresh analysis' : 'analyse now'}
              </button>
            ) : null
          }
        >
          {analyzing ? (
            <Spinner label="Claude is reading the headlines" />
          ) : err ? (
            <div className="rounded border border-bearish/30 bg-bearish/10 p-2 text-xs text-bearish">{err}</div>
          ) : latest ? (
            <div>
              <Markdown text={latest.content} />
              <div className="mt-3 border-t border-border pt-2 text-[10px] text-fg-muted">
                {latest.model} · {latest.headline_count} headlines · {ago(latest.created_at)}
                {!aiEnabled && ' · set ANTHROPIC_API_KEY to refresh'}
              </div>
            </div>
          ) : !aiEnabled ? (
            <div className="text-xs text-fg-muted">
              Set <code className="text-fg-secondary">ANTHROPIC_API_KEY</code> in{' '}
              <code className="text-fg-secondary">backend/.env</code> and restart to enable AI
              analysis. News fetching works without it.
            </div>
          ) : (
            <div className="text-xs text-fg-muted">
              Click <span className="text-accent">analyse now</span> for a digest of today's news and
              how it touches your watchlist and holdings.
            </div>
          )}
        </Card>
      </div>

      {/* news list */}
      <div className="lg:col-span-2">
        <Card
          title="Headlines"
          action={
            <div className="flex gap-1">
              {(['all', 'global', 'taiwan'] as const).map((r) => (
                <Pill key={r} active={region === r} onClick={() => setRegion(r)}>
                  {r === 'all' ? 'All' : r === 'global' ? 'Global' : 'TW'}
                </Pill>
              ))}
            </div>
          }
          pad={false}
        >
          <Async q={news} empty="No headlines — hit ↻ refresh.">
            {() => (
              <ul className="max-h-[70vh] divide-y divide-border/50 overflow-y-auto">
                {items.map((n) => (
                  <NewsRow key={n.id} n={n} />
                ))}
              </ul>
            )}
          </Async>
        </Card>
      </div>
    </div>
  );
}

function NewsRow({ n }: { n: NewsItem }) {
  return (
    <li className="px-3 py-2">
      <a
        href={n.url}
        target="_blank"
        rel="noreferrer noopener"
        className="text-sm leading-snug text-fg-secondary hover:text-fg"
      >
        {n.title}
      </a>
      <div className="mt-1 flex items-center gap-2 text-[10px] text-fg-muted">
        <Badge tone={n.region === 'taiwan' ? 'highlight' : 'info'}>
          {n.region === 'taiwan' ? 'TW' : 'GLOBAL'}
        </Badge>
        <span>{n.source}</span>
        <span className={clsx('ml-auto')}>{ago(n.published_at ?? n.fetched_at)}</span>
      </div>
    </li>
  );
}
