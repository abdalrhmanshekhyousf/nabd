import { Router } from 'express';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { myOwnFile } from '../services/medicalRecord.service.js';

// The patient's own space (phase 3): their medical file (task 3.23).
export const patientRouter = Router();

patientRouter.use(authenticate, requireRole('PATIENT'));

patientRouter.get('/me/file', async (req, res) => {
  const { auth, db } = session(req);
  res.json(await myOwnFile(db, auth.userId));
});
