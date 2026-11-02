import { Router } from 'express';
import { authenticate, session } from '../middleware/auth.js';
import { listNotifications } from '../services/notification.service.js';

// Everyone's own notifications (task 2.2); marking them read comes with the bell (2.4).
export const notificationRouter = Router();

notificationRouter.use(authenticate);
notificationRouter.get('/', async (req, res) => {
  const { auth, db } = session(req);
  res.json(await listNotifications(db, auth.userId));
});
