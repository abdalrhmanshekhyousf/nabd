import { REPORT_KINDS, reportPeriodSchema, submitReportSchema } from '@nabd/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import {
  getReport,
  listReports,
  previewReport,
  reportKindFor,
  submitReport,
} from '../services/report.service.js';

// Department reports to the admin (task 3.11): the pharmacist previews and
// sends the pharmacy's report for a period; the admin reads them all.
export const reportRouter = Router();

reportRouter.use(authenticate, requireRole('PHARMACIST', 'ADMIN'));

reportRouter.get('/preview', async (req, res) => {
  const { auth, db } = session(req);
  const { from, to, kind } = reportPeriodSchema
    .and(z.object({ kind: z.enum(REPORT_KINDS).optional() }))
    .parse(req.query);
  const own = reportKindFor(auth.role, kind);
  res.json({ data: await previewReport(db, own, new Date(from), new Date(to)) });
});

reportRouter.post('/', async (req, res) => {
  const { auth, db } = session(req);
  const input = submitReportSchema.parse(req.body);
  reportKindFor(auth.role, input.kind);
  res.status(201).json({ report: await submitReport(db, auth.hospitalId, auth.userId, input) });
});

reportRouter.get('/', async (req, res) => {
  const { auth, db } = session(req);
  res.json({ reports: await listReports(db, auth.role) });
});

reportRouter.get('/:id', async (req, res) => {
  const { auth, db } = session(req);
  const { id } = z.object({ id: z.uuid() }).parse(req.params);
  res.json({ report: await getReport(db, auth.role, id) });
});
