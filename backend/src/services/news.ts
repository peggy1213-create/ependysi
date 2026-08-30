/**
 * Fetch market-relevant headlines from public RSS feeds — global (English) and
 * Taiwan (中文) — normalize, dedupe, and cache. No API key.
 */
import { XMLParser } from 'fast-xml-parser';
import { createHash } from 'node:crypto';
import { fetchText } from '../lib/http.js';
import { upsertNews, pruneNews, pruneAnalyses } from '../repos/news.repo.js';
import type { NewsItem } from '../repos/news.repo.js';

interface Feed {
  url: string;
  source: string;
  region: 'global' | 'taiwan';
}

const FEEDS: Feed[] = [
  // Global
  {
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114',
    source: 'CNBC',
    region: 'global',
  },
  {
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15839069',
    source: 'CNBC Markets',
    region: 'global',
  },
  {
    url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories',
    source: 'MarketWatch',
    region: 'global',
  },
  // Taiwan
  {
    url: 'https://news.cnyes.com/rss/v1/news/category/headline',
    source: '鉅亨網',
    region: 'taiwan',
  },
  {
    url: 'https://news.cnyes.com/rss/v1/news/category/tw_stock',
    source: '鉅亨網 台股',
    region: 'taiwan',
  },
  {
    url: 'https://feeds.feedburner.com/rsscna/finance',
    source: '中央社',
    region: 'taiwan',
  },
];

const parser = new XMLParser({ ignoreAttributes: false, cdataPropName: '__cdata' });

const text = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v !== null && '__cdata' in v) return String((v as { __cdata: unknown }).__cdata);
  if (typeof v === 'object' && v !== null && '#text' in v) return String((v as { '#text': unknown })['#text']);
  return String(v);
};

const stripHtml = (s: string): string =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

function toIso(pubDate: string): string | null {
  const t = Date.parse(pubDate);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

async function parseFeed(feed: Feed): Promise<Omit<NewsItem, 'fetched_at'>[]> {
  let xml: string;
  try {
    xml = await fetchText(feed.url, { timeoutMs: 12000, headers: { Accept: 'application/rss+xml, application/xml, text/xml' } });
  } catch {
    return [];
  }
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    return [];
  }
  const channel = (doc as { rss?: { channel?: { item?: unknown } } })?.rss?.channel;
  const rawItems = channel?.item;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

  return items
    .slice(0, 20)
    .map((raw): Omit<NewsItem, 'fetched_at'> | null => {
      const it = raw as Record<string, unknown>;
      const title = stripHtml(text(it.title));
      const url = text(it.link).trim() || text(it.guid).trim();
      if (!title || !url) return null;
      const summary =
        stripHtml(text(it.description) || text(it['content:encoded'])).slice(0, 400) || null;
      return {
        id: createHash('sha1').update(url).digest('hex'),
        title,
        summary,
        url,
        source: feed.source,
        region: feed.region,
        published_at: toIso(text(it.pubDate)),
      };
    })
    .filter((x): x is Omit<NewsItem, 'fetched_at'> => x !== null);
}

export async function refreshNews(): Promise<{ fetched: number; feeds: number }> {
  const results = await Promise.allSettled(FEEDS.map(parseFeed));
  const byId = new Map<string, Omit<NewsItem, 'fetched_at'>>();
  let ok = 0;
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    if (r.value.length) ok++;
    for (const item of r.value) if (!byId.has(item.id)) byId.set(item.id, item);
  }
  const items = [...byId.values()];
  if (items.length) upsertNews(items);
  pruneNews(10);
  pruneAnalyses(30);
  return { fetched: items.length, feeds: ok };
}
