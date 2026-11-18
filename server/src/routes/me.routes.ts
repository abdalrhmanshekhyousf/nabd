import { Router } from 'express';
import { getMe, updatePreferences } from '../controllers/me.controller.js';
import { authenticate, session } from '../middleware/auth.js';
import { roleHome } from '../services/roleHome.service.js';

// Any signed-in user, any role.
export const meRouter = Router();

meRouter.use(authenticate);
meRouter.get('/', getMe);
meRouter.patch('/preferences', updatePreferences);

// My home's figures (after 4.24): today's work of my role.
meRouter.get('/home', async (req, res) => {
  const { auth, db } = session(req);
  res.json({ tiles: await roleHome(db, auth.userId, auth.role) });
});
