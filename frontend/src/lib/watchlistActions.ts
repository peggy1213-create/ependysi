import { api } from './api';
import { invalidate } from './useApi';
import type { WatchItem } from './types';

export interface AddOpts {
  tags?: string[];
  group_names?: string[];
  type?: WatchItem['type'];
}

/** Add a ticker to the watchlist (backend auto-detects market/type/name). */
export async function addTicker(
  ticker: string,
  opts: AddOpts = {},
): Promise<{ ticker: string; name: string | null }> {
  const r = await api.post<{ item: { ticker: string; name: string | null } }>('/watchlist', {
    ticker: ticker.trim(),
    ...opts,
  });
  invalidate('/watchlist');
  invalidate('/portfolio');
  return r.item;
}

/** Replace a watchlist item's tags (free-form; new tags are created on the fly). */
export async function updateTags(id: number, tags: string[]): Promise<void> {
  await api.put(`/watchlist/${id}`, { tags });
  invalidate('/watchlist');
  invalidate('/portfolio');
}

/** Stop tracking a watchlist item. Holdings (if any) are NOT deleted. */
export async function removeItem(id: number): Promise<void> {
  await api.del(`/watchlist/${id}`);
  invalidate('/watchlist');
  invalidate('/portfolio');
}
