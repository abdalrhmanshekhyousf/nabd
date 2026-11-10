import { scheduleSchema } from '@nabd/shared';
import { Router } from 'express';
import { z } from 'zod';
import { create, list, remove, update } from '../controllers/staff.controller.js';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { doctorSchedule, saveSchedule } from '../services/schedule.service.js';

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
