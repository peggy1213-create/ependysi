import { Router } from 'express';
import { getRankings, getIndustryStocks, type IndustrySort } from '../services/rankings.js';

export const rankingsRouter = Router();

// GET /api/rankings?limit=20
//   漲幅 / 跌幅 / 熱門 / 外資買超 / 投信買超 + the list of 產業 to pick from.
rankingsRouter.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 5), 50);
    res.json(await getRankings(limit));
  } catch (err) {
    next(err);
  }
});

// GET /api/rankings/industry/:code?sort=change|volume|turnover&limit=60
//   Every traded name in one 產業別, sorted (default: today's change%).
rankingsRouter.get('/industry/:code', async (req, res, next) => {
  try {
    const raw = String(req.query.sort);
    const sort: IndustrySort = raw === 'volume' || raw === 'turnover' ? raw : 'change';
    const limit = Number(req.query.limit) || 60;
    res.json(await getIndustryStocks(String(req.params.code), { sort, limit }));
  } catch (err) {
    next(err);
  }
});
