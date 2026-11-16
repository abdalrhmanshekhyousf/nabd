import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import {
  getInvoice,
  issueInvoice,
  openAccounts,
  patientAccount,
} from '../services/invoice.service.js';

// The accountant's invoices (task 4.13): patients' open charges, and issuing
// an invoice for them to print.
export const invoiceRouter = Router();

invoiceRouter.use(authenticate, requireRole('ACCOUNTANT', 'ADMIN'));

const refresh = (hospitalId: string) => {
  emitRefresh(rooms.role(hospitalId, 'ACCOUNTANT'), [['accounts']]);
  emitRefresh(rooms.role(hospitalId, 'ADMIN'), [['accounts']]);
};

invoiceRouter.get('/accounts', async (req, res) => {
  const { db } = session(req);
  const { search } = z.object({ search: z.string().trim().max(100).default('') }).parse(req.query);
  res.json({ accounts: await openAccounts(db, search) });
});

invoiceRouter.get('/accounts/:patientId', async (req, res) => {
  const { db } = session(req);
  const { patientId } = z.object({ patientId: z.uuid() }).parse(req.params);
  res.json(await patientAccount(db, patientId));
});

invoiceRouter.post('/', async (req, res) => {
  const { auth, db } = session(req);
  const { patientId, itemIds } = z
    .object({ patientId: z.uuid(), itemIds: z.array(z.uuid()).min(1).nullable().default(null) })
    .parse(req.body);
  const invoice = await issueInvoice(db, auth.hospitalId, auth.userId, patientId, itemIds);
  refresh(auth.hospitalId);
  res.status(201).json({ invoice });
});

invoiceRouter.get('/:id', async (req, res) => {
  const { db } = session(req);
  const { id } = z.object({ id: z.uuid() }).parse(req.params);
  res.json({ invoice: await getInvoice(db, id) });
});
