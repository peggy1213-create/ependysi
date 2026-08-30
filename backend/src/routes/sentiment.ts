import { Router } from 'express';
import { notImplemented } from './_helpers.js';

export const sentimentRouter = Router();

// GET /api/sentiment   -> VIX, Fear & Greed index, put/call ratio, ...
sentimentRouter.get('/', notImplemented('market sentiment'));
