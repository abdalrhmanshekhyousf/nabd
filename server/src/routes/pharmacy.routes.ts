import { dispenseSchema } from '@nabd/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { dispensePrescription, pharmacyBoard } from '../services/pharmacy.service.js';

// The pharmacy (task 3.10): incoming prescriptions and dispensing them, which
// takes the medicines out of stock and records them in the patient's file.
export const pharmacyRouter = Router();

pharmacyRouter.use(authenticate, requireRole('PHARMACIST'));

pharmacyRouter.get('/prescriptions', async (req, res) => {
  const { db } = session(req);
  res.json({ prescriptions: await pharmacyBoard(db) });
});

pharmacyRouter.post('/prescriptions/:id/dispense', async (req, res) => {
  const { auth, db } = session(req);
  const { id } = z.object({ id: z.uuid() }).parse(req.params);
  const input = dispenseSchema.parse(req.body);
  res.json(await dispensePrescription(db, auth.hospitalId, auth.userId, id, input));
});
