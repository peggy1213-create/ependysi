import { env } from './config.js';
import { startServer } from './server.js';

startServer().then(({ url }) => {
  console.log(`[server] API listening on ${url}/api (${env.nodeEnv})`);
  console.log('[server] no background scheduler — data refreshes on POST /api/refresh (the UI ↻ button)');
});
