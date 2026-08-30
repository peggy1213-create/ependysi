import { Router } from 'express';
import { z } from 'zod';
import * as items from '../repos/watchlist.repo.js';
import * as groups from '../repos/groups.repo.js';
import { normalizeWatchlist } from '../services/normalize.js';
import { resolveInstrument } from '../services/resolve.js';
import { searchTickers } from '../services/search.js';
import { refreshWatchlistQuotes } from '../services/marketData.js';

export const watchlistRouter = Router();

const instrumentType = z.enum(['stock', 'tw_etf', 'us_etf', 'index', 'commodity', 'crypto']);

// ── GET /api/watchlist ─────────────────────────────────────────────────────
// ?group=<name>  ?tag=<tag>  — optional filters
watchlistRouter.get('/', (req, res) => {
  const group = typeof req.query.group === 'string' ? req.query.group : undefined;
  const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined;
  let list = normalizeWatchlist(items.listItems());
  if (group) list = list.filter((i) => i.group_names.includes(group));
  if (tag) list = list.filter((i) => i.tags.includes(tag));
  res.json({ items: list, count: list.length });
});

// ── GET /api/watchlist/search?q= ───────────────────────────────────────────
watchlistRouter.get('/search', async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    if (q.trim().length < 1) return res.json({ query: q, results: [] });
    res.json({ query: q, results: await searchTickers(q) });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/watchlist/groups ──────────────────────────────────────────────
watchlistRouter.get('/groups', (_req, res) => {
  res.json({ groups: groups.listGroups() });
});

// ── POST /api/watchlist/groups ─────────────────────────────────────────────
const groupBody = z.object({
  group_name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500).optional(),
});
watchlistRouter.post('/groups', (req, res) => {
  const parsed = groupBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
  if (groups.groupExists(parsed.data.group_name)) {
    return res.status(409).json({ error: 'group_exists' });
  }
  res.status(201).json({ group: groups.createGroup(parsed.data.group_name, parsed.data.description) });
});

watchlistRouter.delete('/groups/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_id' });
  res.json({ deleted: groups.deleteGroup(id) });
});

// ── POST /api/watchlist ────────────────────────────────────────────────────
const addBody = z.object({
  ticker: z.string().trim().min(1).max(20),
  tags: z.array(z.string().trim().min(1)).optional(),
  group_names: z.array(z.string().trim().min(1)).optional(),
  type: instrumentType.optional(), // hint only; auto-detect wins if confident
});
watchlistRouter.post('/', async (req, res, next) => {
  try {
    const parsed = addBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
    }
    const { ticker, tags, group_names, type } = parsed.data;
    const resolved = await resolveInstrument(ticker, type);

    if (items.findByTicker(resolved.ticker)) {
      return res.status(409).json({ error: 'already_watched', ticker: resolved.ticker });
    }

    const created = items.addItem({
      ticker: resolved.ticker,
      name: resolved.name,
      market: resolved.market,
      type: resolved.type,
      tags,
    });
    if (group_names?.length) items.setGroups(created.id, group_names);

    // best-effort immediate quote so the UI shows data right away
    refreshWatchlistQuotes().catch(() => {});

    res.status(201).json({ item: items.getItem(created.id) });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/watchlist/:id ─────────────────────────────────────────────────
const patchBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  user_tags: z.array(z.string().trim().min(1)).optional(), // alias
  display_order: z.number().int().min(0).optional(),
  group_names: z.array(z.string().trim().min(1)).optional(),
});
watchlistRouter.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_id' });
  const parsed = patchBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });

  const updated = items.updateItem(id, {
    name: parsed.data.name,
    tags: parsed.data.tags ?? parsed.data.user_tags,
    display_order: parsed.data.display_order,
    group_names: parsed.data.group_names,
  });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ item: updated });
});

// ── DELETE /api/watchlist/:id ──────────────────────────────────────────────
watchlistRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_id' });
  res.json({ deleted: items.removeItem(id) });
});
