/** CRUD for watchlist_groups. */
import { all, get, run } from '../db/index.js';

export interface Group {
  id: number;
  group_name: string;
  description: string | null;
  created_at: string;
  item_count: number;
}

export function listGroups(): Group[] {
  return all<Group>(
    `SELECT g.id, g.group_name, g.description, g.created_at,
            (SELECT COUNT(*) FROM watchlist_group_items gi WHERE gi.group_id = g.id) AS item_count
     FROM watchlist_groups g
     ORDER BY g.group_name`,
  );
}

export function createGroup(name: string, description?: string | null): Group {
  const info = run(
    'INSERT INTO watchlist_groups (group_name, description, created_at) VALUES (?, ?, ?)',
    name.trim(),
    description?.trim() || null,
    new Date().toISOString(),
  );
  return get<Group>(
    `SELECT id, group_name, description, created_at, 0 AS item_count
     FROM watchlist_groups WHERE id = ?`,
    Number(info.lastInsertRowid),
  )!;
}

export function groupExists(name: string): boolean {
  return get<{ one: number }>('SELECT 1 AS one FROM watchlist_groups WHERE group_name = ?', name.trim()) !== undefined;
}

export function deleteGroup(id: number): boolean {
  return run('DELETE FROM watchlist_groups WHERE id = ?', id).changes > 0;
}
