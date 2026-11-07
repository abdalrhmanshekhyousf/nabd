import { labResultSchema } from '@nabd/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { optionalReportUpload } from '../middleware/upload.js';
import { labBoard, labResultFile, recordLabResult, startLabTest } from '../services/lab.service.js';

// The lab (task 3.5): its board of ordered tests, taking one, and recording
// the result into the patient's file. The result file is served to those
// allowed to see it.
export const labRouter = Router();

labRouter.use(authenticate);

const idParam = z.object({ id: z.uuid() });

labRouter.get('/', requireRole('LAB_TECHNICIAN'), async (req, res) => {
  const { auth, db } = session(req);
  res.json({ tests: await labBoard(db, auth.userId) });
});

labRouter.post('/:id/start', requireRole('LAB_TECHNICIAN'), async (req, res) => {
  const { auth, db } = session(req);
  const { id } = idParam.parse(req.params);
  res.json({ test: await startLabTest(db, auth.hospitalId, auth.userId, id) });
});

labRouter.post(
  '/:id/result',
  requireRole('LAB_TECHNICIAN'),
  optionalReportUpload,
  async (req, res) => {
    const { auth, db } = session(req);
    const { id } = idParam.parse(req.params);
    // A form with only a file may leave the values out.
    const input = labResultSchema.parse({ result: '', ...req.body });
    const test = await recordLabResult(
      db,
      auth.hospitalId,
      auth.userId,
      id,
      input,
      req.file?.buffer ?? null,
    );
    res.json({ test });
  },
);

labRouter.get('/:id/file', async (req, res) => {
  const { auth, db } = session(req);
  const { id } = idParam.parse(req.params);
  const { path, type } = await labResultFile(db, { userId: auth.userId, role: auth.role }, id);
  res.type(type);
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(path);
});
