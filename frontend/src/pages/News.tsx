import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { api } from '../lib/api';
import { invalidate } from '../lib/useApi';
import { useNews, useNewsAnalysis, useNewsAnalyses, useNewsAnalysisById } from '../lib/hooks';
import { Async, Badge, Card, Pill, Spinner } from '../components/ui';
import { Markdown } from '../components/Markdown';
import { ago, dateTime } from '../lib/format';
import type { AnalysisMode, NewsAnalysis, NewsAnalysisMeta, NewsItem } from '../lib/types';

export default function News() {
  const news = useNews();
  const [mode, setMode] = useState<AnalysisMode>('standard');
  const analysis = useNewsAnalysis(mode);
  const history = useNewsAnalyses(mode);
  const [region, setRegion] = useState<'all' | 'global' | 'taiwan'>('all');
  const [analyzing, setAnalyzing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pinningId, setPinningId] = useState<number | null>(null);

  // null = show the current (latest) briefing; a number = view that past run.
  const [viewingId, setViewingId] = useState<number | null>(null);
  const viewed = useNewsAnalysisById(viewingId);
  const [showHistory, setShowHistory] = useState(false);

  const items = useMemo(() => {
    const all = news.data?.items ?? [];
    return region === 'all' ? all : all.filter((i) => i.region === region);
  }, [news.data, region]);

  const aiEnabled = news.data?.ai_enabled ?? analysis.data?.ai_enabled ?? false;
  const latest = analysis.data?.analysis ?? null;
  const displayed: NewsAnalysis | null = viewingId
    ? viewed.data?.analysis ?? null
    : latest;
  const isHistoric = viewingId != null && displayed != null && displayed.id !== latest?.id;
  const runs = history.data?.analyses ?? [];

  const switchMode = (m: AnalysisMode) => {
    setMode(m);
    setViewingId(null);
    setErr(null);
  };

  const analyze = async () => {
    setAnalyzing(true);
    setErr(null);
    try {
      await api.post('/news/analyze', { mode });
      setViewingId(null);
      invalidate(`/news/analysis?mode=${mode}`);
      invalidate(`/news/analyses?mode=${mode}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  const togglePin = async (a: NewsAnalysis | NewsAnalysisMeta) => {
    setPinningId(a.id);
    try {
      await api.post(`/news/analysis/${a.id}/pin`, { pinned: !a.pinned });
      invalidate(`/news/analyses?mode=${mode}`);
      invalidate(`/news/analysis?mode=${mode}`);
      if (viewingId) invalidate(`/news/analysis/${viewingId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'could not update pin');
    } finally {
      setPinningId(null);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {/* AI briefing */}
      <div className="lg:col-span-3">
        <Card
          title="AI market briefing"
          action={
            <div className="flex items-center gap-1.5">
              {(['standard', 'deep'] as const).map((m) => (
                <Pill key={m} active={mode === m} onClick={() => switchMode(m)}>
                  {m === 'standard' ? 'Briefing' : 'Deep dive'}
                </Pill>
              ))}
              {aiEnabled ? (
                <button
                  onClick={analyze}
                  disabled={analyzing}
                  className="rounded bg-accent px-2.5 py-1 text-[11px] font-medium text-bg disabled:opacity-50"
                >
                  {analyzing ? 'analysing…' : latest ? 'refresh' : 'analyse now'}
                </button>
              ) : null}
            </div>
          }
        >
          {analyzing ? (
            <Spinner
              label={
                mode === 'deep'
                  ? 'Gemini is analysing your positions — this takes a bit'
                  : 'Gemini is reading the headlines'
              }
            />
          ) : err ? (
            <div className="rounded border border-bearish/30 bg-bearish/10 p-2 text-xs text-bearish">{err}</div>
          ) : viewingId && viewed.loading && !displayed ? (
            <Spinner label="Loading briefing" />
          ) : displayed ? (
            <div>
              {/* last-updated / history bar */}
              <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-fg-muted">
                <span className="text-fg-secondary">
                  {isHistoric ? 'Briefing from' : 'Last updated'} {dateTime(displayed.created_at)}
                </span>
                {isHistoric && <Badge tone="highlight">history</Badge>}
                <button
                  onClick={() => togglePin(displayed)}
                  disabled={pinningId === displayed.id}
                  className={clsx(
                    'transition-colors disabled:opacity-40',
                    displayed.pinned ? 'text-accent' : 'text-fg-muted hover:text-fg',
                  )}
                  title={displayed.pinned ? 'Unpin — may be auto-removed after 30 days' : 'Pin to keep this briefing'}
                >
                  {displayed.pinned ? '★ saved' : '☆ save'}
                </button>
                {isHistoric && (
                  <button onClick={() => setViewingId(null)} className="text-accent hover:underline">
                    ← back to latest
                  </button>
                )}
                {runs.length > 1 && (
                  <button
                    onClick={() => setShowHistory((s) => !s)}
                    className="ml-auto text-fg-muted hover:text-fg"
                  >
                    {showHistory ? 'hide history' : `history (${runs.length})`}
                  </button>
                )}
              </div>

              {showHistory && (
                <ul className="mb-3 divide-y divide-border/50 rounded border border-border">
                  {runs.map((r) => {
                    const active = r.id === displayed.id;
                    const isLatest = r.id === latest?.id;
                    return (
                      <li
                        key={r.id}
                        className={clsx(
                          'flex items-center gap-2 px-2.5 py-1.5 text-[11px]',
                          active && 'bg-surface',
                        )}
                      >
                        <button
                          onClick={() => togglePin(r)}
                          disabled={pinningId === r.id}
                          className={clsx(
                            'disabled:opacity-40',
                            r.pinned ? 'text-accent' : 'text-fg-muted hover:text-fg',
                          )}
                          title={r.pinned ? 'Unpin' : 'Pin to keep'}
                        >
                          {r.pinned ? '★' : '☆'}
                        </button>
                        <button
                          onClick={() => setViewingId(isLatest ? null : r.id)}
                          className={clsx(
                            'flex-1 text-left hover:text-fg',
                            active ? 'text-fg' : 'text-fg-secondary',
                          )}
                        >
                          {dateTime(r.created_at)}
                        </button>
                        {isLatest && <Badge tone="accent">latest</Badge>}
                        <span className="text-fg-muted">{r.headline_count} hl</span>
                      </li>
                    );
                  })}
                </ul>
              )}

              <Markdown text={displayed.content} />
              <div className="mt-3 border-t border-border pt-2 text-[10px] text-fg-muted">
                {displayed.mode === 'deep' && 'deep dive · '}
                {displayed.model} · {displayed.headline_count} headlines · {ago(displayed.created_at)}
                {!aiEnabled && ' · set GEMINI_API_KEY to refresh'}
              </div>
            </div>
          ) : !aiEnabled ? (
            <div className="text-xs text-fg-muted">
              Set <code className="text-fg-secondary">GEMINI_API_KEY</code> in{' '}
              <code className="text-fg-secondary">backend/.env</code> and restart to enable AI
              analysis. News fetching works without it.
            </div>
          ) : (
            <div className="text-xs text-fg-muted">
              {mode === 'deep' ? (
                <>
                  Click <span className="text-accent">analyse now</span> for a position-by-position
                  research note — valuation context, analyst consensus (per Yahoo Finance), and a
                  balanced bull/bear read on each name. Slower to generate.
                </>
              ) : (
                <>
                  Click <span className="text-accent">analyse now</span> for a digest of today's news
                  and how it touches your watchlist and holdings.
                </>
              )}
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
