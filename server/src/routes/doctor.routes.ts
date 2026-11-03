import {
  createPrescriptionSchema,
  createReportSchema,
  doctorStatusSchema,
  patientSearchSchema,
} from '@nabd/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import { getMyStatus, setMyStatus } from '../services/doctor.service.js';
import {
  addPrescription,
  addReport,
  getPatientFile,
  listMyPatients,
} from '../services/medicalRecord.service.js';

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

const patientParam = z.object({ patientId: z.uuid() });

// My patients and their files (task 2.7).
doctorRouter.get('/me/patients', requireRole('DOCTOR'), async (req, res) => {
  const { auth, db } = session(req);
  const { search } = patientSearchSchema.parse(req.query);
  res.json({ patients: await listMyPatients(db, auth.userId, search) });
});

doctorRouter.get('/me/patients/:patientId', requireRole('DOCTOR'), async (req, res) => {
  const { auth, db } = session(req);
  const { patientId } = patientParam.parse(req.params);
  res.json(await getPatientFile(db, auth.userId, patientId));
});

/** The doctor's open screens show the new entry at once. */
function refreshFile(userId: string, patientId: string) {
  emitRefresh(rooms.user(userId), [['patient-file', patientId], ['my-patients']]);
}

// Writing in the file (task 2.8).
doctorRouter.post('/me/patients/:patientId/reports', requireRole('DOCTOR'), async (req, res) => {
  const { auth, db } = session(req);
  const { patientId } = patientParam.parse(req.params);
  const input = createReportSchema.parse(req.body);
  const report = await addReport(db, auth.hospitalId, auth.userId, patientId, input);
  refreshFile(auth.userId, patientId);
  res.status(201).json({ report });
});

doctorRouter.post(
  '/me/patients/:patientId/prescriptions',
  requireRole('DOCTOR'),
  async (req, res) => {
    const { auth, db } = session(req);
    const { patientId } = patientParam.parse(req.params);
    const input = createPrescriptionSchema.parse(req.body);
    const prescription = await addPrescription(db, auth.hospitalId, auth.userId, patientId, input);
    refreshFile(auth.userId, patientId);
    // The pharmacy's queue (task 3.10) picks it up live.
    emitRefresh(rooms.role(auth.hospitalId, 'PHARMACIST'), [['prescriptions']]);
    res.status(201).json({ prescription });
  },
);
