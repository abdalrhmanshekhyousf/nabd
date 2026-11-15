import {
  identifyPatientSchema,
  patientAccountSchema,
  quickRegistrationSchema,
  receptionPatientSchema,
  receptionSearchSchema,
} from '@nabd/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import {
  identifyPatient,
  openAccount,
  registerAtReception,
  registerErArrival,
  searchPatients,
} from '../services/reception.service.js';

// Reception (task 4.1): finding a patient, registering a new one with their
// file (and account if they want one), and opening an account later.
export const receptionRouter = Router();

receptionRouter.use(authenticate, requireRole('RECEPTIONIST', 'ADMIN'));

receptionRouter.get('/patients', async (req, res) => {
  const { db } = session(req);
  const { search, anonymous } = receptionSearchSchema.parse(req.query);
  res.json({ patients: await searchPatients(db, search, anonymous) });
});

receptionRouter.post('/patients', async (req, res) => {
  const { auth, db } = session(req);
  const input = receptionPatientSchema.parse(req.body);
  res.status(201).json({ patient: await registerAtReception(db, auth.hospitalId, input) });
});

receptionRouter.post('/patients/:id/account', async (req, res) => {
  const { auth, db } = session(req);
  const { id } = z.object({ id: z.uuid() }).parse(req.params);
  const input = patientAccountSchema.parse(req.body);
  res.status(201).json({ patient: await openAccount(db, auth.hospitalId, id, input) });
});

// The emergency desk (task 4.3): reception registers an arrival for the ER
// nurses to triage, and names an unidentified patient later.
receptionRouter.post('/er-arrivals', async (req, res) => {
  const { auth, db } = session(req);
  const input = quickRegistrationSchema.parse(req.body);
  const { visit, departmentId } = await registerErArrival(db, auth.hospitalId, input);
  emitRefresh(rooms.department(departmentId), [['er-queue']]);
  emitRefresh(rooms.role(auth.hospitalId, 'RECEPTIONIST'), [['reception']]);
  res.status(201).json({ visit });
});

receptionRouter.post('/patients/:id/identify', async (req, res) => {
  const { auth, db } = session(req);
  const { id } = z.object({ id: z.uuid() }).parse(req.params);
  const input = identifyPatientSchema.parse(req.body);
  const result = await identifyPatient(db, id, input);
  // The ER list and the open files show the name now.
  emitRefresh(rooms.hospital(auth.hospitalId), [['er-queue'], ['reception'], ['patient-file']]);
  res.json(result);
});
