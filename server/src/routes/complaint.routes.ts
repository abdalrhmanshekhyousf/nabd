import { complaintSchema } from '@nabd/shared';
import { Router } from 'express';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import { fileComplaint, myComplaints } from '../services/complaint.service.js';

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
