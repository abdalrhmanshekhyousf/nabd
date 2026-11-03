import { doctorStatusSchema } from '@nabd/shared';
import { Router } from 'express';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import { getMyStatus, setMyStatus } from '../services/doctor.service.js';

// Doctors' own tools (phase 2).
export const doctorRouter = Router();

doctorRouter.use(authenticate);

doctorRouter.get('/me/status', requireRole('DOCTOR'), async (req, res) => {
  const { auth, db } = session(req);
  res.json(await getMyStatus(db, auth.userId));
});

doctorRouter.patch('/me/status', requireRole('DOCTOR'), async (req, res) => {
  const { auth, db } = session(req);
  const input = doctorStatusSchema.parse(req.body);
  const result = await setMyStatus(db, auth.userId, input);
  // Live: the doctor's other devices, and every screen of the hospital that
  // shows doctors (staff list now, ER doctor picker in 2.16).
  emitRefresh(rooms.user(auth.userId), [['doctor-status']]);
  emitRefresh(rooms.hospital(auth.hospitalId), [['staff'], ['doctors']]);
  res.json(result);
});
