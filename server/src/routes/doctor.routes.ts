import { doctorStatusSchema, patientSearchSchema } from '@nabd/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import { getMyStatus, setMyStatus } from '../services/doctor.service.js';
import { getPatientFile, listMyPatients } from '../services/medicalRecord.service.js';

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

// My patients and their files, read-only for now (task 2.7).
doctorRouter.get('/me/patients', requireRole('DOCTOR'), async (req, res) => {
  const { auth, db } = session(req);
  const { search } = patientSearchSchema.parse(req.query);
  res.json({ patients: await listMyPatients(db, auth.userId, search) });
});

doctorRouter.get('/me/patients/:patientId', requireRole('DOCTOR'), async (req, res) => {
  const { auth, db } = session(req);
  const { patientId } = z.object({ patientId: z.uuid() }).parse(req.params);
  res.json(await getPatientFile(db, auth.userId, patientId));
});
