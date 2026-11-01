import { Router } from 'express';
import {
  deleteLogo,
  getHospital,
  getLogo,
  updateHospital,
  uploadLogo,
} from '../controllers/hospital.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { logoUpload } from '../middleware/upload.js';

// The caller's own hospital: everyone signed in may read it (sidebar, printouts),
// only its admin may change it.
export const hospitalRouter = Router();

hospitalRouter.use(authenticate);
hospitalRouter.get('/', getHospital);
hospitalRouter.patch('/', requireRole('ADMIN'), updateHospital);
hospitalRouter.get('/logo', getLogo);
hospitalRouter.put('/logo', requireRole('ADMIN'), logoUpload, uploadLogo);
hospitalRouter.delete('/logo', requireRole('ADMIN'), deleteLogo);
