import { Router } from 'express';
import { notImplemented } from './_helpers.js';

export const macroRouter = Router();

// GET /api/macro/fx              -> FX rates (focus USD/TWD)
// GET /api/macro/yields          -> government bond yields (FRED: DGS10, DGS2, ...)
// GET /api/macro/rates           -> central bank policy rates
// GET /api/macro/series/:id      -> a single FRED series history
macroRouter.get('/fx', notImplemented('FX rates'));
macroRouter.get('/yields', notImplemented('bond yields'));
macroRouter.get('/rates', notImplemented('central bank rates'));
macroRouter.get('/series/:id', notImplemented('macro series history'));
