import { leaveRequestSchema, ROLES } from '@nabd/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import { cancelLeave, myLeave, requestLeave } from '../services/leave.service.js';

// Leave requests (task 4.5): every staff member asks for days off and follows
// their requests; the admin decides them (4.7).
export const leaveRouter = Router();

leaveRouter.use(authenticate, requireRole(...ROLES.filter((role) => role !== 'PATIENT')));

leaveRouter.get('/mine', async (req, res) => {
  const { auth, db } = session(req);
  res.json({ requests: await myLeave(db, auth.userId) });
});

leaveRouter.post('/', async (req, res) => {
  const { auth, db } = session(req);
  const input = leaveRequestSchema.parse(req.body);
  const request = await requestLeave(db, auth.hospitalId, auth.userId, input);
  emitRefresh(rooms.role(auth.hospitalId, 'ADMIN'), [['requests']]);
  res.status(201).json({ request });
});

leaveRouter.delete('/:id', async (req, res) => {
  const { auth, db } = session(req);
  const { id } = z.object({ id: z.uuid() }).parse(req.params);
  const request = await cancelLeave(db, auth.userId, id);
  emitRefresh(rooms.role(auth.hospitalId, 'ADMIN'), [['requests']]);
  res.json({ request });
});
