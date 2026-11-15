import { decisionSchema, REQUEST_KINDS } from '@nabd/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import { approvals, decide } from '../services/approval.service.js';

// The admin's approvals (task 4.7): leave, purchase and repair requests.
export const approvalRouter = Router();

approvalRouter.use(authenticate, requireRole('ADMIN'));

approvalRouter.get('/', async (req, res) => {
  const { db } = session(req);
  const { status } = z
    .object({ status: z.enum(['PENDING', 'DECIDED']).default('PENDING') })
    .parse(req.query);
  res.json(await approvals(db, status));
});

approvalRouter.post('/:kind/:id', async (req, res) => {
  const { auth, db } = session(req);
  const { kind, id } = z.object({ kind: z.enum(REQUEST_KINDS), id: z.uuid() }).parse(req.params);
  const input = decisionSchema.parse(req.body);
  const result = await decide(db, auth.hospitalId, auth.userId, kind, id, input);
  // The admins' lists, the department's lists and the requester's own.
  emitRefresh(rooms.role(auth.hospitalId, 'ADMIN'), [['requests']]);
  if (result.departmentId) emitRefresh(rooms.department(result.departmentId), [['requests']]);
  if (result.kind === 'leave') {
    emitRefresh(rooms.user(result.request.requester.id), [['requests']]);
  }
  res.json({ request: result.request });
});
