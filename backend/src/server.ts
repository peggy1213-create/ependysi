import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from './config.js';
import './db/index.js'; // open connection + apply schema + seed before routes load
import { apiRouter } from './routes/index.js';

export interface RunningServer {
  port: number;
  url: string;
  close: () => Promise<void>;
}

export interface StartOpts {
  /** 0 = let the OS pick a free port (used by the desktop app). Defaults to env.PORT. */
  port?: number;
  /** Absolute path to a built frontend (`frontend/dist`) to serve on the same port. */
  serveFrontend?: string;
}

export function startServer(opts: StartOpts = {}): Promise<RunningServer> {
  const app = express();

  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json());

  app.use('/api', apiRouter);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

  // Serve the built SPA on the same origin (packaged / production).
  const frontendDist = opts.serveFrontend ?? process.env.SERVE_FRONTEND;
  if (frontendDist && existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get('*', (_req, res) => res.sendFile(resolve(frontendDist, 'index.html')));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[error]', err);
    res.status(500).json({ error: 'internal_error' });
  });

  const wanted = opts.port ?? env.port;
  return new Promise((resolvePromise, rejectPromise) => {
    const server = app.listen(wanted, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : wanted;
      resolvePromise({
        port,
        url: `http://localhost:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
    server.on('error', rejectPromise);
  });
}
