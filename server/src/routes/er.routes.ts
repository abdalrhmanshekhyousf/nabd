import { overrideLevelSchema, quickRegistrationSchema, triageSchema } from '@nabd/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import {
  erDepartmentOf,
  getQueue,
  getVisit,
  overrideLevel,
  registerArrival,
  requireErNurse,
  saveTriage,
} from '../services/er.service.js';

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

const visitParam = z.object({ id: z.uuid() });

/** The waiting list, live through refresh events on [['er-queue']] (task 2.15). */
erRouter.get('/queue', async (req, res) => {
  const { auth, db } = session(req);
  await requireErNurse(db, auth.userId);
  res.json({ visits: await getQueue(db) });
});

erRouter.get('/visits/:id', async (req, res) => {
  const { auth, db } = session(req);
  await requireErNurse(db, auth.userId);
  const { id } = visitParam.parse(req.params);
  res.json({ visit: await getVisit(db, id) });
});

/** The triage form: complaint, vital signs, consciousness, pain (task 2.12). */
erRouter.put('/visits/:id/triage', async (req, res) => {
  const { auth, db } = session(req);
  const departmentId = await requireErNurse(db, auth.userId);
  const { id } = visitParam.parse(req.params);
  const input = triageSchema.parse(req.body);
  const visit = await saveTriage(db, auth.userId, id, input);
  emitRefresh(rooms.department(departmentId), [['er-queue'], ['er-visit', id]]);
  res.json({ visit });
});

/** The nurse sets another level than suggested, with a reason (task 2.14). */
erRouter.put('/visits/:id/level', async (req, res) => {
  const { auth, db } = session(req);
  const departmentId = await requireErNurse(db, auth.userId);
  const { id } = visitParam.parse(req.params);
  const input = overrideLevelSchema.parse(req.body);
  const visit = await overrideLevel(db, auth.userId, id, input);
  emitRefresh(rooms.department(departmentId), [['er-queue'], ['er-visit', id]]);
  res.json({ visit });
});
