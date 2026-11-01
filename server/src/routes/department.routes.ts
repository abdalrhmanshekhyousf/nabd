import { Router } from 'express';
import { addDefaults, create, list, remove, rename } from '../controllers/department.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

// Departments of the caller's hospital: everyone signed in may list them (forms,
// booking); only the admin changes them (task 1.24).
export const departmentRouter = Router();

departmentRouter.use(authenticate);
departmentRouter.get('/', list);
departmentRouter.post('/', requireRole('ADMIN'), create);
departmentRouter.post('/defaults', requireRole('ADMIN'), addDefaults);
departmentRouter.patch('/:id', requireRole('ADMIN'), rename);
departmentRouter.delete('/:id', requireRole('ADMIN'), remove);
