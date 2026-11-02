import { Router } from 'express';
import { assignCleaner, assignNurse, list } from '../controllers/assignment.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

// Nurses and cleaners spread over the departments (task 1.29), admin-only.
export const assignmentRouter = Router();

assignmentRouter.use(authenticate, requireRole('ADMIN'));
assignmentRouter.get('/', list);
assignmentRouter.put('/nurses/:id', assignNurse);
assignmentRouter.put('/cleaners/:id', assignCleaner);
