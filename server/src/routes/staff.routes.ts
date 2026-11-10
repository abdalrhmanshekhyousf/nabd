import { scheduleSchema, vacationSchema } from '@nabd/shared';
import { Router } from 'express';
import { z } from 'zod';
import { create, list, remove, update } from '../controllers/staff.controller.js';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import {
  addVacation,
  doctorSchedule,
  removeVacation,
  saveSchedule,
} from '../services/schedule.service.js';

// The hospital's employees, managed by the admin (tasks 1.27, 1.28). Salaries and
// contact details are not for everyone, so every route here is admin-only.
export const staffRouter = Router();

staffRouter.use(authenticate, requireRole('ADMIN'));
staffRouter.get('/', list);
staffRouter.post('/', create);
staffRouter.patch('/:id', update);
staffRouter.delete('/:id', remove);

// A doctor's working days and hours, set by the admin (task 3.19).
const idParam = z.object({ id: z.uuid() });
staffRouter.get('/:id/schedule', async (req, res) => {
  const { db } = session(req);
  const { id } = idParam.parse(req.params);
  res.json(await doctorSchedule(db, id));
});
staffRouter.put('/:id/schedule', async (req, res) => {
  const { auth, db } = session(req);
  const { id } = idParam.parse(req.params);
  const input = scheduleSchema.parse(req.body);
  res.json(await saveSchedule(db, auth.hospitalId, id, input));
});

// A doctor's vacations (task 3.21): adding one cancels the visits on those days.
staffRouter.post('/:id/vacations', async (req, res) => {
  const { auth, db } = session(req);
  const { id } = idParam.parse(req.params);
  const input = vacationSchema.parse(req.body);
  res.status(201).json(await addVacation(db, auth.hospitalId, auth.userId, id, input));
});
staffRouter.delete('/:id/vacations/:vacationId', async (req, res) => {
  const { auth, db } = session(req);
  const { id, vacationId } = z.object({ id: z.uuid(), vacationId: z.uuid() }).parse(req.params);
  res.json(await removeVacation(db, auth.hospitalId, id, vacationId));
});
