import { Router } from 'express';
import { appConfig } from '../config.js';
import { getQuotes } from '../repos/quotes.repo.js';
import { refreshAlwaysOn } from '../services/marketData.js';

export const marketsRouter = Router();

type Section = 'indices' | 'fx' | 'commodities' | 'sentiment';

function sectionPayload(section: Section) {
  const cfg = appConfig.alwaysOn[section];
  const quotes = getQuotes(cfg.map((c) => c.ticker));
  return cfg.map((c) => {
    const q = quotes.get(c.ticker);
    return {
      ticker: c.ticker,
      name: c.name,
      kind: c.type,
      price: q?.price ?? null,
      change_pct: q?.change_pct ?? null,
      volume: q?.volume ?? null,
      currency: q?.currency ?? null,
      fetched_at: q?.fetched_at ?? null,
    };
  });
}

// GET /api/markets            -> everything always-on
// GET /api/markets/indices    -> just indices  (also /fx /commodities /sentiment)
marketsRouter.get('/', (_req, res) => {
  res.json({
    indices: sectionPayload('indices'),
    fx: sectionPayload('fx'),
    commodities: sectionPayload('commodities'),
    sentiment: sectionPayload('sentiment'),
  });
});

for (const section of ['indices', 'fx', 'commodities', 'sentiment'] as Section[]) {
  marketsRouter.get(`/${section}`, (_req, res) => res.json({ [section]: sectionPayload(section) }));
}

// POST /api/markets/refresh   -> force a refresh now
marketsRouter.post('/refresh', async (_req, res, next) => {
  try {
    res.json({ result: await refreshAlwaysOn() });
  } catch (err) {
    next(err);
  }
});
