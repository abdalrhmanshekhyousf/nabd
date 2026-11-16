import { reminderSchema, reminderUpdateSchema } from '@nabd/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { patientOfUser } from '../services/appointment.service.js';
import { myInvoices } from '../services/invoice.service.js';
import { myOwnFile } from '../services/medicalRecord.service.js';
import {
  createReminder,
  deleteReminder,
  myMedications,
  updateReminder,
} from '../services/reminder.service.js';
import { auditPatientFile } from '../middleware/audit.js';

// The patient's own space (phase 3): their medical file (task 3.23).
export const patientRouter = Router();

patientRouter.use(authenticate, requireRole('PATIENT'));

patientRouter.use(
  '/me/file',
  auditPatientFile((req, db) => patientOfUser(db, session(req).auth.userId)),
);

patientRouter.get('/me/file', async (req, res) => {
  const { auth, db } = session(req);
  res.json(await myOwnFile(db, auth.userId));
});

// My medicines and their reminders (task 3.26).
const idParam = z.object({ id: z.uuid() });

/** My invoices (task 4.15): to print, and what is still due. */
patientRouter.get('/me/invoices', async (req, res) => {
  const { auth, db } = session(req);
  res.json(await myInvoices(db, await patientOfUser(db, auth.userId)));
});

patientRouter.get('/me/medications', async (req, res) => {
  const { auth, db } = session(req);
  res.json(await myMedications(db, auth.userId));
});

patientRouter.post('/me/reminders', async (req, res) => {
  const { auth, db } = session(req);
  const input = reminderSchema.parse(req.body);
  res.status(201).json({ reminder: await createReminder(db, auth.hospitalId, auth.userId, input) });
});

patientRouter.patch('/me/reminders/:id', async (req, res) => {
  const { auth, db } = session(req);
  const { id } = idParam.parse(req.params);
  const input = reminderUpdateSchema.parse(req.body);
  res.json({ reminder: await updateReminder(db, auth.userId, id, input) });
});

patientRouter.delete('/me/reminders/:id', async (req, res) => {
  const { auth, db } = session(req);
  const { id } = idParam.parse(req.params);
  await deleteReminder(db, auth.userId, id);
  res.status(204).end();
});
