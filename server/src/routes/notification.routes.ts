import { Router } from 'express';
import { z } from 'zod';
import { authenticate, session } from '../middleware/auth.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import { listNotifications, markAllRead, markRead } from '../services/notification.service.js';

// Everyone's own notifications (tasks 2.2, 2.4).
export const notificationRouter = Router();

const idParam = z.object({ id: z.uuid() });

notificationRouter.use(authenticate);

notificationRouter.get('/', async (req, res) => {
  const { auth, db } = session(req);
  res.json(await listNotifications(db, auth.userId));
});

notificationRouter.patch('/:id/read', async (req, res) => {
  const { auth, db } = session(req);
  const { id } = idParam.parse(req.params);
  const result = await markRead(db, auth.userId, id);
  // The same person's other tabs and devices update their bell too.
  emitRefresh(rooms.user(auth.userId), [['notifications']]);
  res.json(result);
});

notificationRouter.post('/read-all', async (req, res) => {
  const { auth, db } = session(req);
  const result = await markAllRead(db, auth.userId);
  emitRefresh(rooms.user(auth.userId), [['notifications']]);
  res.json(result);
});
