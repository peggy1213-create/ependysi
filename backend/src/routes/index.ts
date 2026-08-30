import { Router } from 'express';
import { watchlistRouter } from './watchlist.js';
import { marketsRouter } from './markets.js';
import { taiwanRouter } from './taiwan.js';
import { portfolioRouter } from './portfolio.js';
import { macroRouter } from './macro.js';
import { calendarRouter } from './calendar.js';
import { sentimentRouter } from './sentiment.js';
import { refreshAll } from '../services/refreshAll.js';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Implemented
apiRouter.use('/watchlist', watchlistRouter); // user-managed tracked instruments + search + groups
apiRouter.use('/markets', marketsRouter); // always-on: indices, FX, commodities, VIX
apiRouter.use('/taiwan', taiwanRouter); // TW institutional flows, per-ticker quote
apiRouter.use('/portfolio', portfolioRouter); // holdings + P&L

// Refresh ALL data now (there is no background scheduler). ?securities=1 also
// rebuilds the TW securities master (slower). The UI's ↻ button hits this.
apiRouter.post('/refresh', async (req, res, next) => {
  try {
    res.json(await refreshAll({ securities: req.query.securities != null }));
  } catch (err) {
    next(err);
  }
});

// Scaffolded, not yet wired to a data source
apiRouter.use('/macro', macroRouter); // FRED: FX, yields, rates
apiRouter.use('/calendar', calendarRouter); // economic events
apiRouter.use('/sentiment', sentimentRouter); // Fear & Greed etc. (VIX is in /markets)
