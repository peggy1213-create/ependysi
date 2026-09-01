import { Router } from 'express';
import { watchlistRouter } from './watchlist.js';
import { marketsRouter } from './markets.js';
import { taiwanRouter } from './taiwan.js';
import { rankingsRouter } from './rankings.js';
import { portfolioRouter } from './portfolio.js';
import { alertsRouter } from './alerts.js';
import { macroRouter } from './macro.js';
import { calendarRouter } from './calendar.js';
import { sentimentRouter } from './sentiment.js';
import { newsRouter } from './news.js';
import { chatRouter } from './chat.js';
import { refreshAll } from '../services/refreshAll.js';
import { refreshWatchlistQuotes, refreshAlwaysOn } from '../services/marketData.js';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Implemented
apiRouter.use('/watchlist', watchlistRouter); // user-managed tracked instruments + search + groups
apiRouter.use('/markets', marketsRouter); // always-on: indices, FX, commodities, VIX
apiRouter.use('/taiwan', taiwanRouter); // TW institutional flows, per-ticker quote
apiRouter.use('/rankings', rankingsRouter); // market-wide TW rankings (漲跌幅 / 熱門 / 買超 / 產業)
apiRouter.use('/portfolio', portfolioRouter); // holdings + P&L
apiRouter.use('/alerts', alertsRouter); // target / stop-loss price alerts
apiRouter.use('/news', newsRouter); // market news + AI analysis
apiRouter.use('/chat', chatRouter); // AI investment Q&A assistant

// Refresh ALL data now (there is no background scheduler). ?securities=1 also
// rebuilds the TW securities master (slower). The UI's ↻ button hits this.
apiRouter.post('/refresh', async (req, res, next) => {
  try {
    res.json(await refreshAll({ securities: req.query.securities != null }));
  } catch (err) {
    next(err);
  }
});

// Prices only — watchlist quotes + always-on backdrop. Cheap enough to poll on
// an interval during market hours (the UI does this; see App.tsx).
apiRouter.post('/refresh/quotes', async (_req, res, next) => {
  try {
    const [watchlistQuotes, alwaysOn] = await Promise.all([
      refreshWatchlistQuotes(),
      refreshAlwaysOn(),
    ]);
    res.json({ watchlistQuotes, alwaysOn });
  } catch (err) {
    next(err);
  }
});

// Scaffolded, not yet wired to a data source
apiRouter.use('/macro', macroRouter); // FRED: FX, yields, rates
apiRouter.use('/calendar', calendarRouter); // economic events
apiRouter.use('/sentiment', sentimentRouter); // Fear & Greed etc. (VIX is in /markets)
