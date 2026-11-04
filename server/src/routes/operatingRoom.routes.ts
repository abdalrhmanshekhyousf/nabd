import { Router } from 'express';
import {
  create,
  history,
  list,
  remove,
  rename,
  setService,
} from '../controllers/operatingRoom.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

// Operating rooms of the caller's hospital (task 1.26): everyone signed in may see
// them (bookings and the live board come in phase 2); only the admin manages them.
export const operatingRoomRouter = Router();

operatingRoomRouter.use(authenticate);
operatingRoomRouter.get('/', list);
operatingRoomRouter.post('/', requireRole('ADMIN'), create);
operatingRoomRouter.patch('/:id', requireRole('ADMIN'), rename);
operatingRoomRouter.patch('/:id/service', requireRole('ADMIN'), setService);
operatingRoomRouter.get('/:id/history', requireRole('ADMIN', 'DOCTOR', 'NURSE'), history);
operatingRoomRouter.delete('/:id', requireRole('ADMIN'), remove);
