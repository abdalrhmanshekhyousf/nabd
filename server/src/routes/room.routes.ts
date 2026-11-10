import { Router, type RequestHandler } from 'express';
import {
  addBed,
  bedStatusHistory,
  create,
  list,
  remove,
  removeBed,
  setBedService,
  update,
} from '../controllers/room.controller.js';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import { bedMap } from '../services/bedMap.service.js';

// Rooms and beds of the caller's hospital (task 1.25): everyone signed in may see
// them (bed maps, admissions); only the admin builds them.
export const roomRouter = Router();

/** After the admin changes rooms or beds, every bed map and ward refreshes (task 3.18). */
const refreshMaps: RequestHandler = (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode < 400) {
      emitRefresh(rooms.hospital(session(req).auth.hospitalId), [['rooms'], ['ward']]);
    }
  });
  next();
};

roomRouter.use(authenticate);
roomRouter.get('/', list);
roomRouter.post('/', requireRole('ADMIN'), refreshMaps, create);
roomRouter.patch('/:id', requireRole('ADMIN'), refreshMaps, update);
roomRouter.delete('/:id', requireRole('ADMIN'), refreshMaps, remove);
roomRouter.post('/:id/beds', requireRole('ADMIN'), refreshMaps, addBed);

export const bedRouter = Router();

bedRouter.use(authenticate);
// The live bed map (task 3.18): the staff who place and care for patients.
bedRouter.get('/map', requireRole('ADMIN', 'DOCTOR', 'NURSE'), async (req, res) => {
  const { db } = session(req);
  res.json({ departments: await bedMap(db) });
});
bedRouter.patch('/:id', requireRole('ADMIN'), refreshMaps, setBedService);
bedRouter.get('/:id/history', requireRole('ADMIN', 'NURSE'), bedStatusHistory);
bedRouter.delete('/:id', requireRole('ADMIN'), refreshMaps, removeBed);
