import { Router } from 'express';
import { getHospital, updateHospital } from '../controllers/hospital.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

// The caller's own hospital: everyone signed in may read it (sidebar, printouts),
// only its admin may change it.
export const hospitalRouter = Router();

hospitalRouter.use(authenticate);
hospitalRouter.get('/', getHospital);
hospitalRouter.patch('/', requireRole('ADMIN'), updateHospital);
