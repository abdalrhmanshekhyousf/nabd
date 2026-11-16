import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { adminOverview } from '../services/overview.service.js';
import { lastMonths, monthBreakdown, monthlyProfit, monthOf } from '../services/profit.service.js';

// The hospital's profit (task 4.17): month by month, for the admin.
export const profitRouter = Router();

profitRouter.use(authenticate, requireRole('ADMIN'));

profitRouter.get('/', async (req, res) => {
  const { db } = session(req);
  const { months } = z
    .object({ months: z.coerce.number().int().min(1).max(24).default(12) })
    .parse(req.query);
  res.json({ months: await monthlyProfit(db, lastMonths(months)) });
});

profitRouter.get('/breakdown', async (req, res) => {
  const { db } = session(req);
  const { month } = z
    .object({
      month: z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
        .optional(),
    })
    .parse(req.query);
  res.json(await monthBreakdown(db, month ?? monthOf(new Date())));
});

// The admin's home (task 4.20).
profitRouter.get('/overview', async (req, res) => {
  const { db } = session(req);
  res.json(await adminOverview(db));
});
