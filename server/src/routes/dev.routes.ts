import { z } from 'zod';
import { Router } from 'express';
import { authenticate, session } from '../middleware/auth.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import { sendNotification } from '../services/notification.service.js';

// Development helpers, never mounted in production.
export const devRouter = Router();

devRouter.use(authenticate);

/** Sends me a sample notification, to try the live toasts and sounds (task 2.3). */
devRouter.post('/notify', async (req, res) => {
  const { auth, db } = session(req);
  const { urgent } = z.object({ urgent: z.boolean().default(false) }).parse(req.body ?? {});
  const [notification] = await sendNotification(db, auth.hospitalId, {
    to: { userIds: [auth.userId] },
    ...(urgent
      ? { type: 'DOCTOR_CALL', data: { patient: 'مريض مجهول · Unknown patient', level: 2 } }
      : { type: 'CLEANING_REQUEST', data: { place: 'غرفة 101 · Room 101' } }),
    link: '/dev/ui',
  });
  emitRefresh(rooms.user(auth.userId), [['notifications']]);
  res.status(201).json({ notification });
});
