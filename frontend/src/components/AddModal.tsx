import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { api } from '../lib/api';
import { invalidate } from '../lib/useApi';
import type { Group, SearchHit } from '../lib/types';
import { Badge } from './ui';

export function AddModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SearchHit | null>(null);
  const [tags, setTags] = useState('');
  const [groupNames, setGroupNames] = useState<string[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setHits([]);
    setSelected(null);
    setTags('');
    setGroupNames([]);
    setDone(null);
    setErr(null);
    setTimeout(() => inputRef.current?.focus(), 30);
    api.get<{ groups: Group[] }>('/watchlist/groups').then((r) => setGroups(r.groups)).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open || q.trim().length < 1) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api.get<{ results: SearchHit[] }>(
          `/watchlist/search?q=${encodeURIComponent(q.trim())}`,
        );
        setHits(r.results);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q, open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const add = async (hit: SearchHit) => {
    setBusy(true);
    setErr(null);
    try {
      await api.post('/watchlist', {
        ticker: hit.ticker,
        type: hit.type,
        tags: tags
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        group_names: groupNames,
      });
      invalidate('/watchlist');
      invalidate('/portfolio');
      setDone(`${hit.ticker} added`);
      setSelected(null);
      setTags('');
      setGroupNames([]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally {
      setBusy(false);
    }
  };

  const toggleGroup = (g: string) =>
    setGroupNames((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-bg/70 p-4 pt-[10vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="u-card w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="text-accent">⌕</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ticker number or name — 2330, TSMC, VOO, 台積電"
            className="w-full bg-transparent text-sm outline-none placeholder:text-fg-muted"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && hits[0]) add(hits[0]);
            }}
          />
          {loading && <span className="text-[10px] text-fg-muted">…</span>}
          <button onClick={onClose} className="text-fg-muted hover:text-fg">
            ✕
          </button>
        </div>

        {/* tag / group assignment */}
        <div className="space-y-2 border-b border-border bg-bg/40 px-4 py-3">
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="tags (optional) — AI dividend core"
            className="w-full rounded bg-surface px-2 py-1 text-xs outline-none placeholder:text-fg-muted"
          />
          {groups.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => toggleGroup(g.group_name)}
                  className={clsx(
                    'rounded px-2 py-0.5 text-[11px]',
                    groupNames.includes(g.group_name)
                      ? 'bg-accent text-bg'
                      : 'bg-surface text-fg-secondary',
                  )}
                >
                  {g.group_name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="max-h-[42vh] overflow-y-auto">
          {hits.length === 0 && q.trim() && !loading && (
            <div className="p-4 text-center text-xs text-fg-muted">no matches</div>
          )}
          {hits.map((h) => (
            <button
              key={h.ticker + h.source}
              onClick={() => add(h)}
              disabled={busy}
              className={clsx(
                'flex w-full items-center gap-3 border-b border-border/60 px-4 py-2.5 text-left hover:bg-surface',
                selected?.ticker === h.ticker && 'bg-surface',
              )}
            >
              <span className="w-20 shrink-0 font-semibold text-accent">{h.ticker}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-fg-secondary">{h.name}</span>
              <Badge tone={h.market === 'US' ? 'info' : h.market === 'INDEX' ? 'muted' : 'highlight'}>
                {h.market}
              </Badge>
              <Badge>{h.type}</Badge>
              <span className="text-accent">＋</span>
            </button>
          ))}
        </div>

        {(done || err) && (
          <div
            className={clsx(
              'px-4 py-2 text-xs',
              err ? 'bg-bearish/10 text-bearish' : 'bg-bullish/10 text-bullish',
            )}
          >
            {err ?? done}
          </div>
        )}
      </div>
    </div>
  );
}
