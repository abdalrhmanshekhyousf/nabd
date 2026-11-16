import { DEFAULT_PRICES, SERVICE_KINDS, servicePriceSchema } from '@nabd/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { HttpError } from '../middleware/errorHandler.js';

// The hospital's price list (task 4.12): the accountant and the admin set what
// each service costs; charges are added at these prices.
export const priceRouter = Router();

priceRouter.use(authenticate, requireRole('ACCOUNTANT', 'ADMIN'));

priceRouter.get('/', async (req, res) => {
  const { db } = session(req);
  const rows = await db.servicePrice.findMany({ orderBy: [{ kind: 'asc' }, { code: 'asc' }] });
  res.json({
    prices: rows.map((row) => ({ ...row, price: Number(row.price) })),
    // What applies to a kind with no price of its own.
    defaults: Object.fromEntries(SERVICE_KINDS.map((kind) => [kind, DEFAULT_PRICES[kind]])),
  });
});

priceRouter.put('/', async (req, res) => {
  const { auth, db } = session(req);
  const { kind, code, name, price } = servicePriceSchema.parse(req.body);
  const row = await db.servicePrice.upsert({
    where: { hospitalId_kind_code: { hospitalId: auth.hospitalId, kind, code } },
    create: { hospitalId: auth.hospitalId, kind, code, name, price },
    update: { name, price },
  });
  res.json({ price: { ...row, price: Number(row.price) } });
});

priceRouter.delete('/:id', async (req, res) => {
  const { db } = session(req);
  const { id } = z.object({ id: z.uuid() }).parse(req.params);
  const { count } = await db.servicePrice.deleteMany({ where: { id } });
  if (count === 0) throw new HttpError(404, 'NOT_FOUND', 'Price not found');
  res.status(204).end();
});
