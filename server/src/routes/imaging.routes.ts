import { imagingReportSchema } from '@nabd/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { imagingUpload } from '../middleware/upload.js';
import {
  imagingFile,
  radiologistQueue,
  reportImaging,
  staffedModalities,
  startImaging,
} from '../services/imaging.service.js';

// Radiology (task 3.7): each request reaches the radiologists of its type only.
// Their list, taking a study, and which types have a radiologist at all; the
// report with its images (3.8), each image served to those allowed (3.9).
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

imagingRouter.post('/:id/report', requireRole('RADIOLOGIST'), imagingUpload, async (req, res) => {
  const { auth, db } = session(req);
  const { id } = z.object({ id: z.uuid() }).parse(req.params);
  const input = imagingReportSchema.parse(req.body);
  const files = ((req.files as Express.Multer.File[] | undefined) ?? []).map((f) => f.buffer);
  res.json({ study: await reportImaging(db, auth.hospitalId, auth.userId, id, input, files) });
});

imagingRouter.get('/:id/images/:index', async (req, res) => {
  const { auth, db } = session(req);
  const { id, index } = z
    .object({ id: z.uuid(), index: z.coerce.number().int().min(0).max(50) })
    .parse(req.params);
  const { path, type } = await imagingFile(db, { userId: auth.userId, role: auth.role }, id, index);
  res.type(type);
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(path);
});
