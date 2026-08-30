import { Router } from 'express';
import { notImplemented } from './_helpers.js';

export const calendarRouter = Router();

// GET /api/calendar?from=&to=   -> economic events (CPI, FOMC, CBC, earnings, ...)
calendarRouter.get('/', notImplemented('economic events calendar'));
