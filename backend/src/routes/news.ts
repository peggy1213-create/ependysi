import { Router } from 'express';
import { env } from '../config.js';
import { listNews, latestAnalysis } from '../repos/news.repo.js';
import { refreshNews } from '../services/news.js';
import { analyzeNews, NoApiKeyError, GeminiApiError } from '../services/newsAnalysis.js';

export const newsRouter = Router();

// GET /api/news?region=global|taiwan
newsRouter.get('/', (req, res) => {
  const region =
    req.query.region === 'global' || req.query.region === 'taiwan' ? req.query.region : undefined;
  res.json({
    items: listNews(region, 80),
    ai_enabled: Boolean(env.keys.gemini),
  });
});

// POST /api/news/refresh
newsRouter.post('/refresh', async (_req, res, next) => {
  try {
    res.json({ result: await refreshNews() });
  } catch (err) {
    next(err);
  }
});

// GET /api/news/analysis  — the latest AI briefing (null if none yet)
newsRouter.get('/analysis', (_req, res) => {
  res.json({ analysis: latestAnalysis() ?? null, ai_enabled: Boolean(env.keys.gemini) });
});

// POST /api/news/analyze  — run a fresh AI briefing
newsRouter.post('/analyze', async (_req, res, next) => {
  try {
    res.json({ analysis: await analyzeNews() });
  } catch (err) {
    if (err instanceof NoApiKeyError) {
      return res.status(400).json({ error: 'no_api_key', message: err.message });
    }
    if (err instanceof GeminiApiError) {
      return res.status(502).json({
        error: 'gemini_error',
        status: err.status,
        message: err.message,
      });
    }
    next(err);
  }
});
