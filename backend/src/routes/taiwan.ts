import { Router } from 'express';
import { historyFor, latestFor } from '../repos/institutional.repo.js';
import { recentFlow } from '../repos/marketFlow.repo.js';
import { getQuote } from '../repos/quotes.repo.js';
import { findByTicker } from '../repos/watchlist.repo.js';
import { refreshTwInstitutional, refreshMarketFlow } from '../services/marketData.js';

export const taiwanRouter = Router();

// GET /api/taiwan/market-flow?days=5  — market-wide 三大法人 net (TWD)
taiwanRouter.get('/market-flow', (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 5, 1), 30);
  res.json({ days: recentFlow(days).reverse() });
});

taiwanRouter.post('/market-flow/refresh', async (_req, res, next) => {
  try {
    res.json({ result: await refreshMarketFlow() });
  } catch (err) {
    next(err);
  }
});

// GET /api/taiwan/institutional/:ticker?days=20
//   Foreign / investment-trust / dealer net flows for a watched Taiwan ticker.
taiwanRouter.get('/institutional/:ticker', (req, res) => {
  const ticker = String(req.params.ticker).toUpperCase();
  const days = Math.min(Number(req.query.days) || 20, 120);
  res.json({
    ticker,
    latest: latestFor(ticker) ?? null,
    history: historyFor(ticker, days),
  });
});

// GET /api/taiwan/stocks/:code — cached quote for one watched TW ticker
taiwanRouter.get('/stocks/:code', (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const watch = findByTicker(code);
  if (!watch) return res.status(404).json({ error: 'not_watched' });
  res.json({ ticker: code, quote: getQuote(code) ?? null });
});

// POST /api/taiwan/institutional/refresh
taiwanRouter.post('/institutional/refresh', async (_req, res, next) => {
  try {
    res.json({ result: await refreshTwInstitutional() });
  } catch (err) {
    next(err);
  }
});
