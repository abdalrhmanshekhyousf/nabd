import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { radiologistQueue, staffedModalities, startImaging } from '../services/imaging.service.js';

// Radiology (task 3.7): each request reaches the radiologists of its type only.
// Their list, taking a study, and which types have a radiologist at all.
export const imagingRouter = Router();

imagingRouter.use(authenticate);

imagingRouter.get('/', requireRole('RADIOLOGIST'), async (req, res) => {
  const { auth, db } = session(req);
  res.json(await radiologistQueue(db, auth.userId));
});

/** For the order dialog: types nobody can do right now are flagged. */
imagingRouter.get('/staffed', requireRole('DOCTOR', 'ADMIN'), async (req, res) => {
  const { db } = session(req);
  res.json({ modalities: await staffedModalities(db) });
});

imagingRouter.post('/:id/start', requireRole('RADIOLOGIST'), async (req, res) => {
  const { auth, db } = session(req);
  const { id } = z.object({ id: z.uuid() }).parse(req.params);
  res.json({ study: await startImaging(db, auth.hospitalId, auth.userId, id) });
});
