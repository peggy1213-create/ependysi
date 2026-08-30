/** CRUD for watchlist_items + group membership joins. */
import { db, all, get, run } from '../db/index.js';
import type { Market, InstrumentType } from '../config.js';

export interface WatchlistItemRow {
  id: number;
  ticker: string;
  name: string | null;
  market: Market;
  type: InstrumentType;
  user_tags: string;
  display_order: number;
  added_at: string;
}

export interface WatchlistItem {
  id: number;
  ticker: string;
  name: string | null;
  market: Market;
  type: InstrumentType;
  tags: string[];
  display_order: number;
  added_at: string;
  group_names: string[];
}

function hydrate(row: WatchlistItemRow): WatchlistItem {
  return {
    id: row.id,
    ticker: row.ticker,
    name: row.name,
    market: row.market,
    type: row.type,
    tags: safeTags(row.user_tags),
    display_order: row.display_order,
    added_at: row.added_at,
    group_names: groupNamesFor(row.id),
  };
}

function safeTags(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function groupNamesFor(itemId: number): string[] {
  return all<{ group_name: string }>(
    `SELECT g.group_name FROM watchlist_group_items gi
     JOIN watchlist_groups g ON g.id = gi.group_id
     WHERE gi.watchlist_item_id = ?
     ORDER BY g.group_name`,
    itemId,
  ).map((r) => r.group_name);
}

export function listItems(): WatchlistItem[] {
  return all<WatchlistItemRow>('SELECT * FROM watchlist_items ORDER BY display_order, id').map(
    hydrate,
  );
}

export function getItem(id: number): WatchlistItem | undefined {
  const row = get<WatchlistItemRow>('SELECT * FROM watchlist_items WHERE id = ?', id);
  return row ? hydrate(row) : undefined;
}

export function findByTicker(ticker: string): WatchlistItemRow | undefined {
  return get<WatchlistItemRow>('SELECT * FROM watchlist_items WHERE ticker = ?', ticker);
}

export interface NewItem {
  ticker: string;
  name: string | null;
  market: Market;
  type: InstrumentType;
  tags?: string[];
}

export function addItem(item: NewItem): WatchlistItem {
  const nextOrder =
    get<{ n: number }>('SELECT COALESCE(MAX(display_order), -1) + 1 AS n FROM watchlist_items')?.n ??
    0;
  const info = run(
    `INSERT INTO watchlist_items (ticker, name, market, type, user_tags, display_order, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    item.ticker,
    item.name,
    item.market,
    item.type,
    JSON.stringify(item.tags ?? []),
    nextOrder,
    new Date().toISOString(),
  );
  return getItem(Number(info.lastInsertRowid))!;
}

export function removeItem(id: number): boolean {
  return run('DELETE FROM watchlist_items WHERE id = ?', id).changes > 0;
}

export interface ItemPatch {
  name?: string;
  tags?: string[];
  display_order?: number;
  group_names?: string[];
}

export function updateItem(id: number, patch: ItemPatch): WatchlistItem | undefined {
  const existing = get<WatchlistItemRow>('SELECT * FROM watchlist_items WHERE id = ?', id);
  if (!existing) return undefined;

  run(
    'UPDATE watchlist_items SET name = ?, user_tags = ?, display_order = ? WHERE id = ?',
    patch.name ?? existing.name,
    patch.tags ? JSON.stringify(patch.tags) : existing.user_tags,
    patch.display_order ?? existing.display_order,
    id,
  );

  if (patch.group_names) setGroups(id, patch.group_names);
  return getItem(id);
}

/** Replace an item's group membership by group name (creating groups as needed). */
export function setGroups(itemId: number, groupNames: string[]): void {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM watchlist_group_items WHERE watchlist_item_id = ?').run(itemId);
    const findGroup = db.prepare('SELECT id FROM watchlist_groups WHERE group_name = ?');
    const makeGroup = db.prepare(
      'INSERT INTO watchlist_groups (group_name, description, created_at) VALUES (?, NULL, ?)',
    );
    const link = db.prepare(
      'INSERT OR IGNORE INTO watchlist_group_items (watchlist_item_id, group_id) VALUES (?, ?)',
    );
    for (const rawName of groupNames) {
      const name = rawName.trim();
      if (!name) continue;
      const found = findGroup.get(name) as { id: number } | undefined;
      const groupId = found
        ? found.id
        : Number(makeGroup.run(name, new Date().toISOString()).lastInsertRowid);
      link.run(itemId, groupId);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
