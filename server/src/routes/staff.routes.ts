import { Router } from 'express';
import { create, list } from '../controllers/staff.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

// The hospital's employees, managed by the admin (tasks 1.27, 1.28). Salaries and
// contact details are not for everyone, so the whole list is admin-only.
export const staffRouter = Router();

staffRouter.use(authenticate, requireRole('ADMIN'));
staffRouter.get('/', list);
staffRouter.post('/', create);
