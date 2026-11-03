import { quickRegistrationSchema } from '@nabd/shared';
import { Router } from 'express';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import { erDepartmentOf, registerArrival, requireErNurse } from '../services/er.service.js';

// The emergency room (phase 2): emergency nurses only.
export const erRouter = Router();

erRouter.use(authenticate, requireRole('NURSE'));

/** Whether I can work the emergency room (my department is the ER). */
erRouter.get('/me', async (req, res) => {
  const { auth, db } = session(req);
  res.json({ canRegister: (await erDepartmentOf(db, auth.userId)) !== null });
});

/** Quick registration of an arrival, known or unidentified (task 2.11). */
erRouter.post('/visits', async (req, res) => {
  const { auth, db } = session(req);
  const departmentId = await requireErNurse(db, auth.userId);
  const input = quickRegistrationSchema.parse(req.body);
  const visit = await registerArrival(db, auth.hospitalId, auth.userId, input);
  // The waiting list (2.15) of the emergency department updates live.
  emitRefresh(rooms.department(departmentId), [['er-queue']]);
  res.status(201).json({ visit });
});
