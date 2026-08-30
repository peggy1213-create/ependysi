import { Router } from 'express';
import { z } from 'zod';
import * as holdings from '../repos/holdings.repo.js';
import { getQuotes } from '../repos/quotes.repo.js';

export const portfolioRouter = Router();

// GET /api/portfolio — holdings with mark-to-market P&L (uses cached quotes)
portfolioRouter.get('/', (_req, res) => {
  const rows = holdings.listHoldings();
  const quotes = getQuotes(rows.map((h) => h.ticker));
  const positions = rows.map((h) => {
    const price = quotes.get(h.ticker)?.price ?? null;
    const marketValue = price != null ? price * h.quantity : null;
    const cost = h.cost_basis * h.quantity;
    return {
      ...h,
      price,
      market_value: marketValue,
      cost_value: cost,
      unrealized_pnl: marketValue != null ? marketValue - cost : null,
      unrealized_pnl_pct: marketValue != null && cost !== 0 ? ((marketValue - cost) / cost) * 100 : null,
    };
  });
  res.json({ positions });
});

const holdingBody = z.object({
  ticker: z.string().trim().min(1).max(20),
  quantity: z.number(),
  cost_basis: z.number().nonnegative(),
  currency: z.string().trim().length(3).toUpperCase().default('TWD'),
  note: z.string().trim().max(500).nullish(),
  opened_at: z.string().trim().max(40).nullish(),
});

portfolioRouter.post('/', (req, res) => {
  const parsed = holdingBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
  res.status(201).json({
    holding: holdings.addHolding({
      ticker: parsed.data.ticker.toUpperCase(),
      quantity: parsed.data.quantity,
      cost_basis: parsed.data.cost_basis,
      currency: parsed.data.currency,
      note: parsed.data.note ?? null,
      opened_at: parsed.data.opened_at ?? null,
    }),
  });
});

portfolioRouter.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_id' });
  const parsed = holdingBody.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
  const updated = holdings.updateHolding(id, parsed.data);
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ holding: updated });
});

portfolioRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_id' });
  res.json({ deleted: holdings.deleteHolding(id) });
});

// GET/PUT /api/portfolio/settings
portfolioRouter.get('/settings', (_req, res) => res.json({ settings: holdings.allSettings() }));
portfolioRouter.put('/settings', (req, res) => {
  const parsed = z.record(z.string(), z.string()).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  for (const [k, v] of Object.entries(parsed.data)) holdings.setSetting(k, v);
  res.json({ settings: holdings.allSettings() });
});
