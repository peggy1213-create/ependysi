import { Router } from 'express';
import { z } from 'zod';
import { listAlerts, ackAlert, ackAllAlerts, countUnacked } from '../repos/alerts.repo.js';
import { detectAlerts } from '../services/alerts.js';

export const alertsRouter = Router();

// Recent alert events (newest first) + count still unacknowledged.
// ?unacked to filter, ?limit=N (default 50, max 200).
alertsRouter.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json({
    alerts: listAlerts({ limit, unackedOnly: req.query.unacked != null }),
    unacked: countUnacked(),
  });
});

// Re-run detection on demand (also runs as part of POST /api/refresh).
alertsRouter.post('/scan', (_req, res) => {
  res.json(detectAlerts());
});

const ackBody = z.object({
  id: z.number().int().positive().optional(),
  all: z.boolean().optional(),
});

alertsRouter.post('/ack', (req, res) => {
  const parsed = ackBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  const { id, all } = parsed.data;
  if (all) return res.json({ acked: ackAllAlerts(), unacked: countUnacked() });
  if (id == null) return res.status(400).json({ error: 'id_or_all_required' });
  res.json({ acked: ackAlert(id) ? 1 : 0, unacked: countUnacked() });
});
