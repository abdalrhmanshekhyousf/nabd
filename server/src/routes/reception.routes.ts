import { patientAccountSchema, receptionPatientSchema, receptionSearchSchema } from '@nabd/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { openAccount, registerAtReception, searchPatients } from '../services/reception.service.js';

// Reception (task 4.1): finding a patient, registering a new one with their
// file (and account if they want one), and opening an account later.
export const receptionRouter = Router();

receptionRouter.use(authenticate, requireRole('RECEPTIONIST', 'ADMIN'));

receptionRouter.get('/patients', async (req, res) => {
  const { db } = session(req);
  const { search } = receptionSearchSchema.parse(req.query);
  res.json({ patients: await searchPatients(db, search) });
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
