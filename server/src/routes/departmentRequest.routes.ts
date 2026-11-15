import { purchaseRequestSchema, repairRequestSchema, ROLES } from '@nabd/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import {
  departmentRequests,
  requestContext,
  requestPurchase,
  requestRepair,
  shortages,
  withdrawRequest,
} from '../services/departmentRequest.service.js';

// A department's requests to the administration (task 4.6 and the department
// heads addition): the head asks to buy what is short and reports equipment
// that needs repair; everyone in the department sees them.
export const departmentRequestRouter = Router();

departmentRequestRouter.use(
  authenticate,
  requireRole(...ROLES.filter((role) => role !== 'PATIENT' && role !== 'ADMIN')),
);

const refresh = (hospitalId: string, departmentId: string) => {
  emitRefresh(rooms.role(hospitalId, 'ADMIN'), [['requests']]);
  emitRefresh(rooms.department(departmentId), [['requests']]);
};

departmentRequestRouter.get('/context', async (req, res) => {
  const { auth, db } = session(req);
  res.json(await requestContext(db, auth.userId));
});

departmentRequestRouter.get('/', async (req, res) => {
  const { auth, db } = session(req);
  res.json(await departmentRequests(db, auth.userId));
});

departmentRequestRouter.get('/shortages', async (req, res) => {
  const { auth, db } = session(req);
  res.json({ items: await shortages(db, auth.userId) });
});

departmentRequestRouter.post('/purchases', async (req, res) => {
  const { auth, db } = session(req);
  const input = purchaseRequestSchema.parse(req.body);
  const request = await requestPurchase(db, auth.hospitalId, auth.userId, input);
  refresh(auth.hospitalId, request.department.id);
  res.status(201).json({ request });
});

departmentRequestRouter.post('/repairs', async (req, res) => {
  const { auth, db } = session(req);
  const input = repairRequestSchema.parse(req.body);
  const request = await requestRepair(db, auth.hospitalId, auth.userId, input);
  refresh(auth.hospitalId, request.department.id);
  res.status(201).json({ request });
});

const withdrawParams = z.object({ kind: z.enum(['purchases', 'repairs']), id: z.uuid() });

departmentRequestRouter.delete('/:kind/:id', async (req, res) => {
  const { auth, db } = session(req);
  const { kind, id } = withdrawParams.parse(req.params);
  await withdrawRequest(db, auth.userId, kind === 'purchases' ? 'purchase' : 'repair', id);
  const { department } = await requestContext(db, auth.userId);
  if (department) refresh(auth.hospitalId, department.id);
  res.status(204).end();
});
