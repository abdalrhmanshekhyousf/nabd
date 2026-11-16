import { meetingAnswerSchema, meetingSchema } from '@nabd/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import {
  answerMeeting,
  callMeeting,
  cancelMeeting,
  hospitalMeetings,
  myMeetings,
} from '../services/meeting.service.js';

// Meetings (task 4.10): the admin asks a doctor to meet at a time; the doctor
// accepts or declines.
export const meetingRouter = Router();

meetingRouter.use(authenticate);

const idParam = z.object({ id: z.uuid() });
const refresh = (hospitalId: string, doctorId: string) => {
  emitRefresh(rooms.role(hospitalId, 'ADMIN'), [['meetings']]);
  emitRefresh(rooms.user(doctorId), [['meetings']]);
};

meetingRouter.get('/', requireRole('ADMIN'), async (req, res) => {
  const { db } = session(req);
  res.json(await hospitalMeetings(db));
});

meetingRouter.post('/', requireRole('ADMIN'), async (req, res) => {
  const { auth, db } = session(req);
  const input = meetingSchema.parse(req.body);
  const meeting = await callMeeting(db, auth.hospitalId, auth.userId, input);
  refresh(auth.hospitalId, meeting.doctor.id);
  res.status(201).json({ meeting });
});

meetingRouter.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  const { auth, db } = session(req);
  const { id } = idParam.parse(req.params);
  const meeting = await cancelMeeting(db, auth.hospitalId, id);
  refresh(auth.hospitalId, meeting.doctor.id);
  res.json({ meeting });
});

meetingRouter.get('/mine', requireRole('DOCTOR'), async (req, res) => {
  const { auth, db } = session(req);
  res.json({ meetings: await myMeetings(db, auth.userId) });
});

meetingRouter.post('/:id/answer', requireRole('DOCTOR'), async (req, res) => {
  const { auth, db } = session(req);
  const { id } = idParam.parse(req.params);
  const input = meetingAnswerSchema.parse(req.body);
  const meeting = await answerMeeting(db, auth.hospitalId, auth.userId, id, input);
  refresh(auth.hospitalId, meeting.doctor.id);
  res.json({ meeting });
});
