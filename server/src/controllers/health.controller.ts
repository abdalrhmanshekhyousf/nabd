import type { Request, Response } from 'express';
import { getHealthStatus } from '../services/health.service.js';

// Controllers translate HTTP <-> service calls. Express 5 forwards async errors
// to the error handler, so no try/catch is needed here.
export function getHealth(_req: Request, res: Response) {
  res.json(getHealthStatus());
}
