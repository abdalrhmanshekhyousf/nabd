import { createCleaningRequestSchema } from '@nabd/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import {
  cancelCleaning,
  cleanerBoard,
  departmentRequests,
  moveRequest,
  requestCleaning,
} from '../services/cleaningTask.service.js';

// Cleaning and sterilization jobs (task 2.24): cleaners see their departments'
// jobs and mark them started and finished; nurses request cleaning (2.25).
export const cleaningRouter = Router();

cleaningRouter.use(authenticate);

cleaningRouter.get('/', requireRole('CLEANER'), async (req, res) => {
  const { auth, db } = session(req);
  res.json({ requests: await cleanerBoard(db, auth.userId) });
});

for (const move of ['start', 'finish'] as const) {
  cleaningRouter.post(`/:id/${move}`, requireRole('CLEANER'), async (req, res) => {
    const { auth, db } = session(req);
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    res.json({ request: await moveRequest(db, auth.hospitalId, auth.userId, id, move) });
  });
}

cleaningRouter.get('/department', requireRole('NURSE'), async (req, res) => {
  const { auth, db } = session(req);
  res.json({ requests: await departmentRequests(db, auth.userId) });
});

cleaningRouter.post('/', requireRole('NURSE'), async (req, res) => {
  const { auth, db } = session(req);
  const input = createCleaningRequestSchema.parse(req.body);
  res.status(201).json({ request: await requestCleaning(db, auth.hospitalId, auth.userId, input) });
});

cleaningRouter.delete('/:id', requireRole('NURSE'), async (req, res) => {
  const { auth, db } = session(req);
  const { id } = z.object({ id: z.uuid() }).parse(req.params);
  res.json({ request: await cancelCleaning(db, auth.userId, id) });
});
