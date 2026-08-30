import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { invalidate } from '../lib/useApi';
import { useGroups, useWatchlist } from '../lib/hooks';
import { Async, Card } from '../components/ui';

export default function Settings() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Groups />
      <Tags />
    </div>
  );
}

function Groups() {
  const groups = useGroups();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      await api.post('/watchlist/groups', { group_name: name.trim(), description: desc.trim() || undefined });
      setName('');
      setDesc('');
      invalidate('/watchlist/groups');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'failed');
    }
  };

  const remove = async (id: number) => {
    await api.del(`/watchlist/groups/${id}`);
    invalidate('/watchlist/groups');
    invalidate('/watchlist');
  };

  return (
    <Card title="Groups">
      <form onSubmit={create} className="mb-3 space-y-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Group name — 半導體供應鏈, 月配息ETF, US Tech"
          className="w-full rounded bg-bg px-2 py-1.5 text-sm outline-none"
        />
        <div className="flex gap-2">
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="description (optional)"
            className="flex-1 rounded bg-bg px-2 py-1.5 text-xs outline-none"
          />
          <button className="rounded bg-accent px-3 py-1 text-xs text-bg" disabled={!name.trim()}>
            add
          </button>
        </div>
        {err && <div className="text-xs text-bearish">{err}</div>}
      </form>
      <Async q={groups}>
        {(g) =>
          g.groups.length ? (
            <ul className="space-y-1 text-sm">
              {g.groups.map((grp) => (
                <li key={grp.id} className="flex items-center gap-2 border-b border-border/40 py-1">
                  <span className="text-fg">{grp.group_name}</span>
                  <span className="text-xs text-fg-muted">{grp.item_count} items</span>
                  {grp.description && <span className="truncate text-xs text-fg-muted">— {grp.description}</span>}
                  <button onClick={() => remove(grp.id)} className="ml-auto text-xs text-bearish hover:underline">
                    delete
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-fg-muted">No groups yet.</div>
          )
        }
      </Async>
    </Card>
  );
}

function Tags() {
  const wl = useWatchlist();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    wl.data?.items.forEach((i) => i.tags.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)));
    return [...m.entries()].sort();
  }, [wl.data]);

  const applyRename = async (oldTag: string, target: string | null) => {
    const items = (wl.data?.items ?? []).filter((i) => i.tags.includes(oldTag));
    await Promise.all(
      items.map((i) => {
        const next = i.tags.filter((t) => t !== oldTag);
        if (target) next.push(target);
        return api.put(`/watchlist/${i.id}`, { user_tags: [...new Set(next)] });
      }),
    );
    setRenaming(null);
    setNewName('');
    invalidate('/watchlist');
  };

  return (
    <Card title="Tags">
      <Async q={wl}>
        {() =>
          tagCounts.length ? (
            <ul className="space-y-1 text-sm">
              {tagCounts.map(([tag, count]) => (
                <li key={tag} className="flex items-center gap-2 border-b border-border/40 py-1">
                  {renaming === tag ? (
                    <>
                      <input
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="rounded bg-bg px-2 py-0.5 text-xs outline-none"
                        onKeyDown={(e) => e.key === 'Enter' && newName.trim() && applyRename(tag, newName.trim())}
                      />
                      <button onClick={() => applyRename(tag, newName.trim())} className="text-xs text-accent">
                        save
                      </button>
                      <button onClick={() => setRenaming(null)} className="text-xs text-fg-muted">
                        cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="rounded bg-border px-1.5 py-0.5 text-xs">{tag}</span>
                      <span className="text-xs text-fg-muted">{count}</span>
                      <button
                        onClick={() => {
                          setRenaming(tag);
                          setNewName(tag);
                        }}
                        className="ml-auto text-xs text-fg-muted hover:text-fg"
                      >
                        rename
                      </button>
                      <button onClick={() => applyRename(tag, null)} className="text-xs text-bearish hover:underline">
                        remove
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-fg-muted">
              No tags. Add tags when adding a ticker, or via the watchlist.
            </div>
          )
        }
      </Async>
    </Card>
  );
}

