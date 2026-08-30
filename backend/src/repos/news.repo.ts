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
export interface NewsAnalysis {
  id: number;
  created_at: string;
  model: string | null;
  headline_count: number | null;
  content: string;
}

export function latestAnalysis(): NewsAnalysis | undefined {
  return get<NewsAnalysis>('SELECT * FROM news_analysis ORDER BY id DESC LIMIT 1');
}

export function saveAnalysis(a: Omit<NewsAnalysis, 'id' | 'created_at'>): NewsAnalysis {
  const info = run(
    'INSERT INTO news_analysis (created_at, model, headline_count, content) VALUES (?, ?, ?, ?)',
    new Date().toISOString(),
    a.model,
    a.headline_count,
    a.content,
  );
  return get<NewsAnalysis>('SELECT * FROM news_analysis WHERE id = ?', Number(info.lastInsertRowid))!;
}
