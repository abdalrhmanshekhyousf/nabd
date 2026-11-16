import { complaintReplySchema, complaintSchema } from '@nabd/shared';
import { z } from 'zod';
import { Router } from 'express';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import {
  fileComplaint,
  hospitalComplaints,
  myComplaints,
  replyToComplaint,
} from '../services/complaint.service.js';

// Complaints (task 4.8): a patient complains to the administration and reads
// the answer; the admin's side is task 4.9.
export const complaintRouter = Router();

complaintRouter.use(authenticate);

complaintRouter.get('/mine', requireRole('PATIENT'), async (req, res) => {
  const { auth, db } = session(req);
  res.json({ complaints: await myComplaints(db, auth.userId) });
});

complaintRouter.post('/', requireRole('PATIENT'), async (req, res) => {
  const { auth, db } = session(req);
  const input = complaintSchema.parse(req.body);
  const complaint = await fileComplaint(db, auth.hospitalId, auth.userId, input);
  emitRefresh(rooms.role(auth.hospitalId, 'ADMIN'), [['complaints']]);
  res.status(201).json({ complaint });
});

// The admin's side (task 4.9): read the complaints and answer them.
complaintRouter.get('/', requireRole('ADMIN'), async (req, res) => {
  const { db } = session(req);
  const { status } = z
    .object({ status: z.enum(['OPEN', 'DONE']).default('OPEN') })
    .parse(req.query);
  res.json({ complaints: await hospitalComplaints(db, status) });
});

complaintRouter.post('/:id/reply', requireRole('ADMIN'), async (req, res) => {
  const { auth, db } = session(req);
  const { id } = z.object({ id: z.uuid() }).parse(req.params);
  const { reply } = complaintReplySchema.parse(req.body);
  const complaint = await replyToComplaint(db, auth.hospitalId, auth.userId, id, reply);
  emitRefresh(rooms.role(auth.hospitalId, 'ADMIN'), [['complaints']]);
  emitRefresh(rooms.user(complaint.author.id), [['complaints']]);
  res.json({ complaint });
});
