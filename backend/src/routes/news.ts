import { Router } from 'express';
import { env } from '../config.js';
import {
  listNews,
  latestAnalysis,
  listAnalyses,
  getAnalysis,
  setAnalysisPinned,
} from '../repos/news.repo.js';
import type { AnalysisMode } from '../repos/news.repo.js';
import { refreshNews } from '../services/news.js';
import { analyzeNews, NoApiKeyError, GeminiApiError } from '../services/newsAnalysis.js';

export const newsRouter = Router();

/** Parse ?mode= / body.mode into a valid AnalysisMode, or null if the value is bad. */
function parseMode(v: unknown): AnalysisMode | null {
  if (v == null || v === '') return 'standard';
  return v === 'standard' || v === 'deep' ? v : null;
}

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

// GET /api/news/analysis?mode=standard|deep  — that mode's latest briefing (null if none yet)
newsRouter.get('/analysis', (req, res) => {
  const mode = parseMode(req.query.mode);
  if (!mode) return res.status(400).json({ error: 'bad_mode', message: 'mode must be standard or deep' });
  res.json({ analysis: latestAnalysis(mode) ?? null, ai_enabled: Boolean(env.keys.gemini) });
});

// GET /api/news/analyses?mode=standard|deep&limit=  — briefing history (metadata, pinned first)
newsRouter.get('/analyses', (req, res) => {
  const mode = parseMode(req.query.mode);
  if (!mode) return res.status(400).json({ error: 'bad_mode', message: 'mode must be standard or deep' });
  const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 100);
  res.json({ analyses: listAnalyses(mode, limit) });
});

// GET /api/news/analysis/:id  — one past briefing, full content
newsRouter.get('/analysis/:id', (req, res) => {
  const a = getAnalysis(Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'not_found' });
  res.json({ analysis: a, ai_enabled: Boolean(env.keys.gemini) });
});

// POST /api/news/analysis/:id/pin  — body { pinned: boolean }
newsRouter.post('/analysis/:id/pin', (req, res) => {
  const pinned = Boolean(req.body?.pinned);
  const a = setAnalysisPinned(Number(req.params.id), pinned);
  if (!a) return res.status(404).json({ error: 'not_found' });
  res.json({ analysis: a });
});

// POST /api/news/analyze  — run a fresh AI briefing; body { mode?: 'standard' | 'deep' }
newsRouter.post('/analyze', async (req, res, next) => {
  const mode = parseMode(req.body?.mode);
  if (!mode) return res.status(400).json({ error: 'bad_mode', message: 'mode must be standard or deep' });
  try {
    res.json({ analysis: await analyzeNews(mode) });
  } catch (err) {
    if (err instanceof NoApiKeyError) {
      return res.status(400).json({ error: 'no_api_key', message: err.message });
    }
    if (err instanceof GeminiApiError) {
      return res.status(502).json({
        error: 'gemini_error',
        status: err.status,
        message: err.friendly,
        detail: err.message,
      });
    }
    next(err);
  }
});
