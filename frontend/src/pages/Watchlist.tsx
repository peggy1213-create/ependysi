import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { useGroups, useWatchlist } from '../lib/hooks';
import { addTicker, removeItem, updateTags } from '../lib/watchlistActions';
import type { WatchItem } from '../lib/types';
import { Async, Badge, Pill, RemoveButton } from '../components/ui';
import { compact, num, pct } from '../lib/format';
import { dirClass } from '../lib/format';

type SortKey =
  | 'ticker'
  | 'change_pct'
  | 'volume'
  | 'foreign_net'
  | 'dividend_yield'
  | 'target_upside'
  | 'manual';

const MARKET_TABS = [
  { key: 'all', label: 'All' },
  { key: 'tw', label: 'TW' },
  { key: 'us', label: 'US' },
] as const;

const TYPE_TABS = [
  { key: 'all', label: 'All' },
  { key: 'stock', label: 'Stocks' },
  { key: 'etf', label: 'ETFs' },
  { key: 'other', label: 'Other' },
] as const;

export default function Watchlist() {
  const wl = useWatchlist();
  const groupsQ = useGroups();
  const [market, setMarket] = useState<(typeof MARKET_TABS)[number]['key']>('all');
  const [typeFilter, setType] = useState<(typeof TYPE_TABS)[number]['key']>('all');
  const [tag, setTag] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [groupView, setGroupView] = useState(false);
  const [sort, setSort] = useState<SortKey>('change_pct');
  const [dir, setDir] = useState<1 | -1>(-1);
  const [quick, setQuick] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; item: WatchItem } | null>(null);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    wl.data?.items.forEach((i) => i.tags.forEach((t) => s.add(t)));
    return [...s].sort();
  }, [wl.data]);

  const quickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = quick.trim();
    if (!t) return;
    setToast(`adding ${t}…`);
    try {
      const item = await addTicker(t);
      setToast(`✓ ${item.ticker} ${item.name ?? ''}`);
      setQuick('');
    } catch (err) {
      setToast(`✕ ${err instanceof Error ? err.message : 'failed'}`);
    }
    setTimeout(() => setToast(null), 2500);
  };

  const remove = async (item: WatchItem) => {
    setMenu(null);
    await removeItem(item.id);
  };

  const setSortKey = (k: SortKey) => {
    if (k === sort) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSort(k);
      setDir(k === 'ticker' ? 1 : -1);
    }
  };

  const filtered = useMemo(() => {
    let items = wl.data?.items ?? [];
    if (market === 'tw') items = items.filter((i) => i.market === 'TWSE' || i.market === 'TPEx');
    if (market === 'us') items = items.filter((i) => i.market === 'US');
    if (typeFilter === 'stock') items = items.filter((i) => i.type === 'stock');
    if (typeFilter === 'etf') items = items.filter((i) => i.type === 'tw_etf' || i.type === 'us_etf');
    if (typeFilter === 'other')
      items = items.filter((i) => !['stock', 'tw_etf', 'us_etf'].includes(i.type));
    if (tag) items = items.filter((i) => i.tags.includes(tag));
    if (group) items = items.filter((i) => i.group_names.includes(group));

    const key = (i: WatchItem): number | string => {
      switch (sort) {
        case 'ticker':
          return i.ticker;
        case 'change_pct':
          return i.change_pct ?? -Infinity;
        case 'volume':
          return i.volume ?? -Infinity;
        case 'foreign_net':
          return i.foreign_net ?? -Infinity;
        case 'dividend_yield':
          return i.dividend_yield ?? -Infinity;
        case 'target_upside':
          return i.target_upside_pct ?? -Infinity;
        case 'manual':
          return i.display_order;
      }
    };
    return [...items].sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      if (typeof ka === 'string') return dir * ka.localeCompare(kb as string);
      return dir * ((ka as number) - (kb as number));
    });
  }, [wl.data, market, typeFilter, tag, group, sort, dir]);

  const grouped = useMemo(() => {
    if (!groupView) return null;
    const map = new Map<string, WatchItem[]>();
    for (const it of filtered) {
      const keys = it.group_names.length ? it.group_names : ['— ungrouped —'];
      for (const g of keys) map.set(g, [...(map.get(g) ?? []), it]);
    }
    return [...map.entries()];
  }, [filtered, groupView]);

  return (
    <div className="space-y-4" onClick={() => menu && setMenu(null)}>
      {/* quick add */}
      <form onSubmit={quickAdd} className="flex items-center gap-2">
        <span className="text-accent">＋</span>
        <input
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          placeholder="Quick add — type 2330, VOO, 台積電 and press Enter"
          className="flex-1 rounded border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent placeholder:text-fg-muted"
        />
        {toast && <span className="text-xs text-fg-secondary">{toast}</span>}
      </form>
      <p className="-mt-2 text-[11px] text-fg-muted">
        Add: quick-add above or the <span className="text-accent">＋</span> button (with tags/groups). Remove:
        hover a row and click ✕, or right-click the row.
      </p>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {MARKET_TABS.map((m) => (
            <Pill key={m.key} active={market === m.key} onClick={() => setMarket(m.key)}>
              {m.label}
            </Pill>
          ))}
        </div>
        <span className="text-border">|</span>
        <div className="flex gap-1">
          {TYPE_TABS.map((t) => (
            <Pill key={t.key} active={typeFilter === t.key} onClick={() => setType(t.key)}>
              {t.label}
            </Pill>
          ))}
        </div>
        {allTags.length > 0 && (
          <>
            <span className="text-border">|</span>
            <select
              value={tag ?? ''}
              onChange={(e) => setTag(e.target.value || null)}
              className="rounded bg-surface px-2 py-1 text-xs text-fg-secondary outline-none"
            >
              <option value="">all tags</option>
              {allTags.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </>
        )}
        {groupsQ.data && groupsQ.data.groups.length > 0 && (
          <select
            value={group ?? ''}
            onChange={(e) => setGroup(e.target.value || null)}
            className="rounded bg-surface px-2 py-1 text-xs text-fg-secondary outline-none"
          >
            <option value="">all groups</option>
            {groupsQ.data.groups.map((g) => (
              <option key={g.id}>{g.group_name}</option>
            ))}
          </select>
        )}
        <span className="text-border">|</span>
        <Pill active={groupView} onClick={() => setGroupView((v) => !v)}>
          ⊞ group view
        </Pill>
        <span className="ml-auto text-xs text-fg-muted">{filtered.length} items</span>
      </div>

      <Async q={wl} empty="Watchlist is empty — use the quick-add bar or the + button.">
        {() => (
          <div className="u-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-fg-muted [&>th]:px-3 [&>th]:py-2 [&>th]:font-normal">
                  <Th onClick={() => setSortKey('ticker')} active={sort === 'ticker'} dir={dir}>
                    Ticker
                  </Th>
                  <th>Name</th>
                  <Th onClick={() => setSortKey('change_pct')} active={sort === 'change_pct'} dir={dir} right>
                    Price / Chg%
                  </Th>
                  <Th onClick={() => setSortKey('volume')} active={sort === 'volume'} dir={dir} right>
                    Volume
                  </Th>
                  <Th
                    onClick={() => setSortKey('foreign_net')}
                    active={sort === 'foreign_net'}
                    dir={dir}
                    right
                  >
                    外資
                  </Th>
                  <Th
                    onClick={() => setSortKey('dividend_yield')}
                    active={sort === 'dividend_yield'}
                    dir={dir}
                    right
                  >
                    Yield
                  </Th>
                  <Th
                    onClick={() => setSortKey('target_upside')}
                    active={sort === 'target_upside'}
                    dir={dir}
                    right
                  >
                    外資目標價
                  </Th>
                  <th className="text-right">Prem/Disc</th>
                  <th>Tags</th>
                  <th className="text-right"> </th>
                </tr>
              </thead>
              <tbody>
                {groupView && grouped
                  ? grouped.map(([g, items]) => (
                      <FragmentGroup key={g} name={g} items={items} onMenu={setMenu} onRemove={remove} />
                    ))
                  : filtered.map((it) => <Row key={it.id} it={it} onMenu={setMenu} onRemove={remove} />)}
              </tbody>
            </table>
          </div>
        )}
      </Async>

      {menu && (
        <div
          className="fixed z-50 u-card w-60 py-1 text-xs shadow-xl"
          style={{
            left: Math.min(menu.x, window.innerWidth - 260),
            top: Math.min(menu.y, window.innerHeight - 230),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1 text-fg-muted">
            {menu.item.ticker}
            {menu.item.in_portfolio && ' · held 💼'}
          </div>
          <TagEditor
            key={menu.item.id}
            item={wl.data?.items.find((i) => i.id === menu.item.id) ?? menu.item}
            allTags={allTags}
          />
          <button
            className="mt-1 block w-full border-t border-border px-3 py-1.5 text-left text-bearish hover:bg-surface"
            onClick={() => remove(menu.item)}
          >
            Remove from watchlist
          </button>
        </div>
      )}
    </div>
  );
}

function TagEditor({ item, allTags }: { item: WatchItem; allTags: string[] }) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const listId = `tags-${item.id}`;

  const commit = async (next: string[]) => {
    setBusy(true);
    try {
      await updateTags(item.id, next);
    } finally {
      setBusy(false);
    }
  };

  const addFromDraft = () => {
    const tokens = draft
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!tokens.length) return;
    const seen = new Set(item.tags.map((t) => t.toLowerCase()));
    const merged = [...item.tags];
    for (const tok of tokens) {
      if (!seen.has(tok.toLowerCase())) {
        seen.add(tok.toLowerCase());
        merged.push(tok);
      }
    }
    setDraft('');
    if (merged.length !== item.tags.length) void commit(merged);
  };

  const removeTag = (t: string) => void commit(item.tags.filter((x) => x !== t));

  const suggestions = allTags.filter((t) => !item.tags.some((x) => x.toLowerCase() === t.toLowerCase()));

  return (
    <div className="px-3 py-1.5">
      <div className="mb-1 flex items-center justify-between text-fg-muted">
        <span>Tags</span>
        {busy && <span className="text-[10px]">saving…</span>}
      </div>
      {item.tags.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {item.tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded bg-border px-1.5 py-0.5 text-[10px] text-fg-secondary">
              {t}
              <button
                className="text-fg-muted hover:text-bearish"
                onClick={() => removeTag(t)}
                aria-label={`remove ${t}`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addFromDraft();
          }
        }}
        onBlur={addFromDraft}
        list={listId}
        placeholder="add tag + Enter"
        className="w-full rounded bg-surface px-2 py-1 text-[11px] outline-none placeholder:text-fg-muted focus:ring-1 focus:ring-accent"
      />
      <datalist id={listId}>
        {suggestions.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  );
}

function targetTitle(it: WatchItem): string {
  const parts: string[] = [];
  if (it.target_low_price != null && it.target_high_price != null)
    parts.push(`區間 ${num(it.target_low_price)}–${num(it.target_high_price)}`);
  if (it.analyst_count != null) parts.push(`${it.analyst_count} 位分析師`);
  if (it.target_price_at) parts.push(`更新 ${it.target_price_at.slice(0, 10)}`);
  return ['外資/分析師目標價 (Yahoo 綜合)', ...parts].join(' · ');
}

function Th({
  children,
  onClick,
  active,
  dir,
  right,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  dir?: number;
  right?: boolean;
}) {
  return (
    <th
      onClick={onClick}
      className={clsx(
        onClick && 'cursor-pointer select-none hover:text-fg-secondary',
        right && 'text-right',
        active && 'text-accent',
      )}
    >
      {children}
      {active && <span className="ml-1">{dir === 1 ? '▲' : '▼'}</span>}
    </th>
  );
}

function FragmentGroup({
  name,
  items,
  onMenu,
  onRemove,
}: {
  name: string;
  items: WatchItem[];
  onMenu: (m: { x: number; y: number; item: WatchItem }) => void;
  onRemove: (it: WatchItem) => void | Promise<void>;
}) {
  return (
    <>
      <tr className="bg-bg/60">
        <td colSpan={10} className="px-3 py-1.5 text-xs font-semibold text-accent">
          {name} <span className="text-fg-muted">· {items.length}</span>
        </td>
      </tr>
      {items.map((it) => (
        <Row key={it.id} it={it} onMenu={onMenu} onRemove={onRemove} />
      ))}
    </>
  );
}

function Row({
  it,
  onMenu,
  onRemove,
}: {
  it: WatchItem;
  onMenu: (m: { x: number; y: number; item: WatchItem }) => void;
  onRemove: (it: WatchItem) => void | Promise<void>;
}) {
  const isEtf = it.type === 'tw_etf' || it.type === 'us_etf';
  const pd = it.premium_discount_pct;
  return (
    <tr
      className="group border-b border-border/50 last:border-0 hover:bg-surface [&>td]:px-3 [&>td]:py-1.5"
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu({ x: e.clientX, y: e.clientY, item: it });
      }}
    >
      <td className="font-semibold text-fg">
        <span className="text-accent">{it.ticker}</span>
        {it.in_portfolio && <span title="in portfolio"> 💼</span>}
      </td>
      <td className="max-w-[180px] truncate text-fg-secondary">{it.name}</td>
      <td className="text-right tnum">
        <div>{num(it.price)}</div>
        <div className={clsx('text-xs', dirClass(it.change_pct))}>{pct(it.change_pct)}</div>
      </td>
      <td className="text-right tnum text-fg-muted">{compact(it.volume)}</td>
      <td className={clsx('text-right tnum', dirClass(it.foreign_net))}>
        {it.foreign_net == null ? '—' : compact(it.foreign_net)}
      </td>
      <td className="text-right tnum text-fg-secondary">
        {it.dividend_yield == null ? '—' : `${num(it.dividend_yield, 2)}%`}
      </td>
      <td className="text-right tnum">
        {it.target_mean_price == null ? (
          <span className="text-fg-muted">—</span>
        ) : (
          <span
            title={targetTitle(it)}
            className="inline-flex flex-col items-end leading-tight"
          >
            <span className="text-fg-secondary">{num(it.target_mean_price)}</span>
            {it.target_upside_pct != null && (
              <span className={clsx('text-xs', dirClass(it.target_upside_pct))}>
                {pct(it.target_upside_pct)}
              </span>
            )}
          </span>
        )}
      </td>
      <td className="text-right tnum">
        {isEtf && pd != null ? (
          <span className={pd > 0 ? 'text-bearish' : 'text-bullish'}>{pct(pd)}</span>
        ) : (
          <span className="text-fg-muted">—</span>
        )}
      </td>
      <td>
        <div className="flex flex-wrap gap-1">
          {it.tags.slice(0, 3).map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </div>
      </td>
      <td className="text-right">
        <span className="opacity-40 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <RemoveButton
            onConfirm={() => onRemove(it)}
            warn={it.in_portfolio ? 'still held in portfolio' : undefined}
          />
        </span>
      </td>
    </tr>
  );
}
