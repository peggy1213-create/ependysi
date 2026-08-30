/** News headlines + AI analysis runs. */
import { all, get, run } from '../db/index.js';

export interface NewsItem {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  source: string | null;
  region: 'global' | 'taiwan';
  published_at: string | null;
  fetched_at: string;
}

export function listNews(region?: 'global' | 'taiwan', limit = 60): NewsItem[] {
  return region
    ? all<NewsItem>(
        'SELECT * FROM news_items WHERE region = ? ORDER BY published_at DESC, fetched_at DESC LIMIT ?',
        region,
        limit,
      )
    : all<NewsItem>(
        'SELECT * FROM news_items ORDER BY published_at DESC, fetched_at DESC LIMIT ?',
        limit,
      );
}

export function upsertNews(items: Omit<NewsItem, 'fetched_at'>[]): number {
  const now = new Date().toISOString();
  const stmt =
    'INSERT INTO news_items (id, title, summary, url, source, region, published_at, fetched_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?) ' +
    'ON CONFLICT(id) DO UPDATE SET title=excluded.title, summary=excluded.summary, ' +
    'source=excluded.source, published_at=excluded.published_at';
  let n = 0;
  for (const it of items) {
    run(stmt, it.id, it.title, it.summary, it.url, it.source, it.region, it.published_at, now);
    n++;
  }
  return n;
}

/** Delete items older than `days`, keeping the table small. */
export function pruneNews(days = 10): void {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  run('DELETE FROM news_items WHERE fetched_at < ?', cutoff);
}

// ── analysis ───────────────────────────────────────────────────────────────
export type AnalysisMode = 'standard' | 'deep';

export interface NewsAnalysis {
  id: number;
  created_at: string;
  mode: AnalysisMode;
  model: string | null;
  headline_count: number | null;
  content: string;
  pinned: boolean;
}

/** History-list row: everything but the (potentially large) markdown body. */
export type NewsAnalysisMeta = Omit<NewsAnalysis, 'content'>;

// SQLite stores `pinned` as 0/1 — raw row shapes before we coerce to boolean.
type AnalysisRow = Omit<NewsAnalysis, 'pinned'> & { pinned: number };
type AnalysisMetaRow = Omit<NewsAnalysisMeta, 'pinned'> & { pinned: number };

/** Latest run for a given mode (each mode caches independently). */
export function latestAnalysis(mode: AnalysisMode = 'standard'): NewsAnalysis | undefined {
  const row = get<AnalysisRow>(
    'SELECT * FROM news_analysis WHERE mode = ? ORDER BY id DESC LIMIT 1',
    mode,
  );
  return row ? { ...row, pinned: row.pinned === 1 } : undefined;
}

/** One run by id (full content). */
export function getAnalysis(id: number): NewsAnalysis | undefined {
  const row = get<AnalysisRow>('SELECT * FROM news_analysis WHERE id = ?', id);
  return row ? { ...row, pinned: row.pinned === 1 } : undefined;
}

/** History for a mode, pinned first then newest — metadata only, no body. */
export function listAnalyses(mode: AnalysisMode, limit = 40): NewsAnalysisMeta[] {
  return all<AnalysisMetaRow>(
    `SELECT id, created_at, mode, model, headline_count, pinned
       FROM news_analysis WHERE mode = ?
       ORDER BY pinned DESC, id DESC LIMIT ?`,
    mode,
    limit,
  ).map((row) => ({ ...row, pinned: row.pinned === 1 }));
}

export function setAnalysisPinned(id: number, pinned: boolean): NewsAnalysis | undefined {
  run('UPDATE news_analysis SET pinned = ? WHERE id = ?', pinned ? 1 : 0, id);
  return getAnalysis(id);
}

/**
 * Drop unpinned briefings older than `days`, but always keep the newest run per
 * mode so a mode is never left with an empty "latest".
 */
export function pruneAnalyses(days = 30): void {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  run(
    `DELETE FROM news_analysis
      WHERE pinned = 0
        AND created_at < ?
        AND id NOT IN (SELECT MAX(id) FROM news_analysis GROUP BY mode)`,
    cutoff,
  );
}

export function saveAnalysis(a: Omit<NewsAnalysis, 'id' | 'created_at' | 'pinned'>): NewsAnalysis {
  const info = run(
    'INSERT INTO news_analysis (created_at, mode, model, headline_count, content) VALUES (?, ?, ?, ?, ?)',
    new Date().toISOString(),
    a.mode,
    a.model,
    a.headline_count,
    a.content,
  );
  return getAnalysis(Number(info.lastInsertRowid))!;
}
