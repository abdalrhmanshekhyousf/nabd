import {
  createConsultationSchema,
  createPrescriptionSchema,
  createReportSchema,
  declineCallSchema,
  imagingOrderSchema,
  labOrderSchema,
  doctorStatusSchema,
  patientSearchSchema,
} from '@nabd/shared';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import {
  cancelConsultation,
  consultationFile,
  listConsultations,
  requestConsultation,
} from '../services/consultation.service.js';
import { getMyStatus, setMyStatus } from '../services/doctor.service.js';
import { listDoctors } from '../services/er.service.js';
import { answerCall, listMyCalls } from '../services/doctorCall.service.js';
import { cancelImaging, orderImaging } from '../services/imaging.service.js';
import { cancelLabTest, orderLabTests } from '../services/lab.service.js';
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

// Emergency calls: the list, and accepting or declining one (task 2.9).
// Lab tests (task 3.4): ordered from the file, withdrawn before the lab starts.
doctorRouter.post('/me/patients/:patientId/lab-tests', requireRole('DOCTOR'), async (req, res) => {
  const { auth, db } = session(req);
  const { patientId } = patientParam.parse(req.params);
  const input = labOrderSchema.parse(req.body);
  const tests = await orderLabTests(db, auth.hospitalId, auth.userId, patientId, input);
  refreshFile(auth.userId, patientId);
  res.status(201).json({ tests });
});

doctorRouter.delete('/me/lab-tests/:id', requireRole('DOCTOR'), async (req, res) => {
  const { auth, db } = session(req);
  const { id } = z.object({ id: z.uuid() }).parse(req.params);
  const test = await cancelLabTest(db, auth.hospitalId, auth.userId, id);
  emitRefresh(rooms.user(auth.userId), [['patient-file']]);
  res.json({ test });
});

// Imaging (task 3.6): ordered from the file, withdrawn before radiology starts.
doctorRouter.post('/me/patients/:patientId/imaging', requireRole('DOCTOR'), async (req, res) => {
  const { auth, db } = session(req);
  const { patientId } = patientParam.parse(req.params);
  const input = imagingOrderSchema.parse(req.body);
  const study = await orderImaging(db, auth.hospitalId, auth.userId, patientId, input);
  refreshFile(auth.userId, patientId);
  res.status(201).json({ study });
});

doctorRouter.delete('/me/imaging/:id', requireRole('DOCTOR'), async (req, res) => {
  const { auth, db } = session(req);
  const { id } = z.object({ id: z.uuid() }).parse(req.params);
  const study = await cancelImaging(db, auth.hospitalId, auth.userId, id);
  emitRefresh(rooms.user(auth.userId), [['patient-file']]);
  res.json({ study });
});

// Consultations (task 3.12): asking a colleague about my patient, withdrawing
// an open question, and the lists of questions asked and received.
doctorRouter.get('/me/colleagues', requireRole('DOCTOR'), async (req, res) => {
  const { auth, db } = session(req);
  const doctors = await listDoctors(db);
  res.json({ doctors: doctors.filter((doctor) => doctor.id !== auth.userId) });
});

doctorRouter.post(
  '/me/patients/:patientId/consultations',
  requireRole('DOCTOR'),
  async (req, res) => {
    const { auth, db } = session(req);
    const { patientId } = patientParam.parse(req.params);
    const input = createConsultationSchema.parse(req.body);
    const consultation = await requestConsultation(
      db,
      auth.hospitalId,
      auth.userId,
      patientId,
      input,
    );
    refreshFile(auth.userId, patientId);
    emitRefresh(rooms.user(auth.userId), [['consultations']]);
    res.status(201).json({ consultation });
  },
);

doctorRouter.delete('/me/consultations/:id', requireRole('DOCTOR'), async (req, res) => {
  const { auth, db } = session(req);
  const { id } = z.object({ id: z.uuid() }).parse(req.params);
  const consultation = await cancelConsultation(db, auth.userId, id);
  emitRefresh(rooms.user(auth.userId), [['patient-file'], ['consultations']]);
  res.json({ consultation });
});

// The consulted doctor reads the file while the question is open (task 3.13).
doctorRouter.get('/me/consultations/:id/file', requireRole('DOCTOR'), async (req, res) => {
  const { auth, db } = session(req);
  const { id } = z.object({ id: z.uuid() }).parse(req.params);
  res.json(await consultationFile(db, auth.userId, id));
});

doctorRouter.get('/me/consultations', requireRole('DOCTOR'), async (req, res) => {
  const { auth, db } = session(req);
  res.json(await listConsultations(db, auth.userId));
});

doctorRouter.get('/me/calls', requireRole('DOCTOR'), async (req, res) => {
  const { auth, db } = session(req);
  res.json(await listMyCalls(db, auth.userId));
});

const callParam = z.object({ id: z.uuid() });

async function answer(req: Request, res: Response, accept: boolean) {
  const { auth, db } = session(req);
  const { id } = callParam.parse(req.params);
  const result = await answerCall(
    db,
    auth.userId,
    id,
    accept ? { accept: true } : { accept: false, reason: declineCallSchema.parse(req.body).reason },
  );
  // The nurse sees the answer at once; the doctor's other screens update too.
  if (result.erDepartmentId) {
    emitRefresh(rooms.department(result.erDepartmentId), [
      ['er-queue'],
      ['er-visit', result.visitId],
    ]);
  }
  emitRefresh(rooms.user(auth.userId), [['doctor-calls'], ['my-patients']]);
  res.json({ call: result.call });
}

doctorRouter.post('/me/calls/:id/accept', requireRole('DOCTOR'), (req, res) =>
  answer(req, res, true),
);
doctorRouter.post('/me/calls/:id/decline', requireRole('DOCTOR'), (req, res) =>
  answer(req, res, false),
);
