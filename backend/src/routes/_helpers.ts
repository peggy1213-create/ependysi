import type { Request, Response } from 'express';

/** Placeholder handler for endpoints that are scaffolded but not wired to a data source yet. */
export function notImplemented(feature: string) {
  return (_req: Request, res: Response) => {
    res.status(501).json({
      error: 'not_implemented',
      feature,
      hint: 'Wire this route to a data source / service in backend/src/services.',
    });
  };
}
