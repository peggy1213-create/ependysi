import { Router } from 'express';
import { z } from 'zod';
import * as lots from '../repos/holdings.repo.js';
import * as divRepo from '../repos/dividends.repo.js';
import * as plans from '../repos/dcaPlans.repo.js';
import { materializePlan, materializeDuePlans, nextDebitDate } from '../services/dca.js';
import { ensureWatched } from '../services/resolve.js';
import {
  computePortfolio,
  computeAllocation,
  computeOverlap,
} from '../services/portfolio.js';
import { dividendSummary, autoDetectDividends } from '../services/dividends.js';
import {
  refreshWatchlistQuotes,
  refreshEtfDetails,
  refreshTwFundamentals,
} from '../services/marketData.js';
import { refreshInstrumentMeta } from '../services/instrumentMeta.js';
import { refreshEtfHoldings } from '../services/etfHoldings.js';

export const portfolioRouter = Router();

// ── Valuation views ────────────────────────────────────────────────────────
portfolioRouter.get('/', (_req, res) => res.json(computePortfolio()));
portfolioRouter.get('/allocation', (_req, res) => res.json(computeAllocation()));
portfolioRouter.get('/overlap', (_req, res) => res.json(computeOverlap()));

// ── Lots CRUD ──────────────────────────────────────────────────────────────
portfolioRouter.get('/lots', (req, res) => {
  const ticker = typeof req.query.ticker === 'string' ? req.query.ticker.toUpperCase() : undefined;
  res.json({ lots: ticker ? lots.lotsForTicker(ticker) : lots.listLots() });
});

const lotBody = z.object({
  ticker: z.string().trim().min(1).max(20),
  shares: z.number().refine((n) => n !== 0, 'shares must be non-zero'),
  cost_basis: z.number().nonnegative(),
  currency: z.string().trim().length(3).optional(),
  purchase_date: z.string().trim().max(40).nullish(),
  notes: z.string().trim().max(1000).nullish(),
  target_price: z.number().positive().nullish(),
  stop_loss: z.number().positive().nullish(),
});

function warmTicker(item: { ticker: string; type: string }): void {
  void refreshWatchlistQuotes()
    .then(() => refreshInstrumentMeta())
    .then(() => (item.type === 'tw_etf' || item.type === 'us_etf' ? refreshEtfHoldings() : null))
    .catch(() => {});
}

portfolioRouter.post('/lots', async (req, res, next) => {
  try {
    const parsed = lotBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
    }
    const d = parsed.data;

    // Portfolio tickers are automatically on the watchlist.
    const { item, added } = await ensureWatched(d.ticker);

    const currency =
      d.currency?.toUpperCase() ?? (item.market === 'US' ? 'USD' : 'TWD');

    const lot = lots.addLot({
      ticker: item.ticker,
      shares: d.shares,
      cost_basis: d.cost_basis,
      currency,
      purchase_date: d.purchase_date ?? null,
      notes: d.notes ?? null,
      target_price: d.target_price ?? null,
      stop_loss: d.stop_loss ?? null,
      plan_id: null,
    });

    warmTicker(item); // non-blocking

    res.status(201).json({ lot, watchlist: { ticker: item.ticker, added } });
  } catch (err) {
    next(err);
  }
});

portfolioRouter.put('/lots/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_id' });
  const parsed = lotBody.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
  }
  const patch = { ...parsed.data } as Record<string, unknown>;
  if (typeof patch.ticker === 'string') patch.ticker = patch.ticker.toUpperCase();
  if (typeof patch.currency === 'string') patch.currency = patch.currency.toUpperCase();
  const updated = lots.updateLot(id, patch);
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ lot: updated });
});

portfolioRouter.delete('/lots/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_id' });
  res.json({ deleted: lots.deleteLot(id) });
});

// ── 定期定額 plans ─────────────────────────────────────────────────────────
const scheduleSchema = z
  .array(
    z.object({
      day: z.number().int().min(1).max(28),
      amount: z.number().positive(),
    }),
  )
  .min(1)
  .max(31);

const isoDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

const planBody = z.object({
  ticker: z.string().trim().min(1).max(20),
  currency: z.string().trim().length(3).optional(),
  start_date: isoDate,
  end_date: isoDate.nullish(),
  schedule: scheduleSchema,
  notes: z.string().trim().max(500).nullish(),
});

function planView(p: plans.Plan) {
  const generated = lots.lotsByPlan(p.id);
  return {
    ...p,
    lots_generated: generated.length,
    invested_orig: Math.round(generated.reduce((s, l) => s + l.cost_basis * l.shares, 0) * 100) / 100,
    next_debit_date: nextDebitDate(p),
  };
}

portfolioRouter.get('/plans', (_req, res) => {
  res.json({ plans: plans.listPlans().map(planView) });
});

portfolioRouter.post('/plans', async (req, res, next) => {
  try {
    const parsed = planBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
    }
    const d = parsed.data;
    const { item, added } = await ensureWatched(d.ticker);
    const currency = d.currency?.toUpperCase() ?? (item.market === 'US' ? 'USD' : 'TWD');

    const plan = plans.addPlan({
      ticker: item.ticker,
      currency,
      start_date: d.start_date,
      end_date: d.end_date ?? null,
      schedule: d.schedule,
      active: true,
      notes: d.notes ?? null,
    });

    let created = 0;
    try {
      created = (await materializePlan(plan)).created;
    } catch {
      /* history fetch failed — lots fill in on the next refresh */
    }
    warmTicker(item); // non-blocking

    res.status(201).json({
      plan: planView(plans.getPlan(plan.id)!),
      lots_created: created,
      watchlist: { ticker: item.ticker, added },
    });
  } catch (err) {
    next(err);
  }
});

const planPatchBody = z.object({
  currency: z.string().trim().length(3).optional(),
  start_date: isoDate.optional(),
  end_date: isoDate.nullish(),
  schedule: scheduleSchema.optional(),
  active: z.boolean().optional(),
  notes: z.string().trim().max(500).nullish(),
});

portfolioRouter.put('/plans/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_id' });
    const parsed = planPatchBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
    }
    const patch = { ...parsed.data };
    if (patch.currency) patch.currency = patch.currency.toUpperCase();
    const updated = plans.updatePlan(id, patch);
    if (!updated) return res.status(404).json({ error: 'not_found' });

    if (updated.active) {
      try {
        await materializePlan(updated);
      } catch {
        /* retried on next refresh */
      }
    }
    res.json({ plan: planView(plans.getPlan(id)!) });
  } catch (err) {
    next(err);
  }
});

portfolioRouter.delete('/plans/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_id' });
  const removedLots = req.query.lots === 'delete' ? lots.deleteLotsByPlan(id) : 0;
  res.json({ deleted: plans.deletePlan(id), lots_deleted: removedLots });
});

// ── Dividends ──────────────────────────────────────────────────────────────
portfolioRouter.get('/dividends', (_req, res) => res.json(dividendSummary()));

const dividendBody = z.object({
  ticker: z.string().trim().min(1).max(20),
  ex_date: z.string().trim().max(40).nullish(),
  pay_date: z.string().trim().max(40).nullish(),
  amount_per_share: z.number().nonnegative(),
  currency: z.string().trim().length(3).default('TWD'),
  shares: z.number().positive().nullish(),
  total_amount: z.number().nonnegative().nullish(),
  note: z.string().trim().max(500).nullish(),
});

portfolioRouter.post('/dividends', (req, res) => {
  const parsed = dividendBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
  }
  const d = parsed.data;
  res.status(201).json({
    dividend: divRepo.addDividend({
      ticker: d.ticker.toUpperCase(),
      ex_date: d.ex_date ?? null,
      pay_date: d.pay_date ?? null,
      amount_per_share: d.amount_per_share,
      currency: d.currency.toUpperCase(),
      shares: d.shares ?? null,
      total_amount: d.total_amount ?? null,
      source: 'manual',
      note: d.note ?? null,
    }),
  });
});

portfolioRouter.delete('/dividends/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_id' });
  res.json({ deleted: divRepo.deleteDividend(id) });
});

portfolioRouter.post('/dividends/detect', (_req, res) => {
  res.json({ result: autoDetectDividends() });
});

// ── Settings ───────────────────────────────────────────────────────────────
portfolioRouter.get('/settings', (_req, res) => res.json({ settings: lots.allSettings() }));
portfolioRouter.put('/settings', (req, res) => {
  const parsed = z.record(z.string(), z.string()).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  for (const [k, v] of Object.entries(parsed.data)) lots.setSetting(k, v);
  res.json({ settings: lots.allSettings() });
});

// ── Refresh everything portfolio-related now ───────────────────────────────
portfolioRouter.post('/refresh', async (_req, res, next) => {
  try {
    const quotes = await refreshWatchlistQuotes();
    const dca = await materializeDuePlans();
    const [etf, twFund, meta, holdings] = await Promise.all([
      refreshEtfDetails(),
      refreshTwFundamentals(),
      refreshInstrumentMeta(),
      refreshEtfHoldings(true),
    ]);
    res.json({ quotes, dca, etf, twFund, meta, holdings });
  } catch (err) {
    next(err);
  }
});
