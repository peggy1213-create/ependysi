import express from 'express';
import cors from 'cors';
import { env } from './config.js';
import './db/index.js'; // open connection + apply schema + seed before routes load
import { apiRouter } from './routes/index.js';

const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());

app.use('/api', apiRouter);

// 404 for unknown API routes
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'internal_error' });
});

app.listen(env.port, () => {
  console.log(`[server] API listening on http://localhost:${env.port}/api (${env.nodeEnv})`);
  console.log('[server] no background scheduler — data refreshes on POST /api/refresh (the UI ↻ button)');
});
