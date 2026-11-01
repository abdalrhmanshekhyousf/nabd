import { Router } from 'express';
import {
  addBed,
  create,
  list,
  remove,
  removeBed,
  setBedService,
  update,
} from '../controllers/room.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

// Rooms and beds of the caller's hospital (task 1.25): everyone signed in may see
// them (bed maps, admissions); only the admin builds them.
export const roomRouter = Router();

roomRouter.use(authenticate);
roomRouter.get('/', list);
roomRouter.post('/', requireRole('ADMIN'), create);
roomRouter.patch('/:id', requireRole('ADMIN'), update);
roomRouter.delete('/:id', requireRole('ADMIN'), remove);
roomRouter.post('/:id/beds', requireRole('ADMIN'), addBed);

export const bedRouter = Router();

bedRouter.use(authenticate);
bedRouter.patch('/:id', requireRole('ADMIN'), setBedService);
bedRouter.delete('/:id', requireRole('ADMIN'), removeBed);
