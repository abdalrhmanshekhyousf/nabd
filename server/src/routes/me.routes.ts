import { Router } from 'express';
import { getMe, updatePreferences } from '../controllers/me.controller.js';
import { authenticate } from '../middleware/auth.js';

// Any signed-in user, any role.
export const meRouter = Router();

meRouter.use(authenticate);
meRouter.get('/', getMe);
meRouter.patch('/preferences', updatePreferences);
