import {
  admitSchema,
  dischargeStaySchema,
  moveStaySchema,
  wardBedStatusSchema,
} from '@nabd/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import {
  admissionCandidates,
  admitPatient,
  dischargeStay,
  moveStay,
  setWardBedStatus,
  wardBoard,
} from '../services/ward.service.js';

// The ward nurse's beds (task 3.16): the board, admitting a patient, moving
// them, discharging them, and holding or freeing a bed by hand.
export const wardRouter = Router();

wardRouter.use(authenticate, requireRole('NURSE'));

const idParam = z.object({ id: z.uuid() });

/** The ward's nurses see it at once; bed maps and the admin's rooms too. */
function announce(hospitalId: string, departmentId: string) {
  emitRefresh(rooms.department(departmentId), [['ward']]);
  emitRefresh(rooms.hospital(hospitalId), [['rooms']]);
}

wardRouter.get('/board', async (req, res) => {
  const { auth, db } = session(req);
  res.json(await wardBoard(db, auth.userId));
});

wardRouter.get('/patients', async (req, res) => {
  const { db } = session(req);
  const { search } = z.object({ search: z.string().trim().min(2).max(100) }).parse(req.query);
  res.json({ patients: await admissionCandidates(db, search) });
});

wardRouter.post('/admissions', async (req, res) => {
  const { auth, db } = session(req);
  const input = admitSchema.parse(req.body);
  const { stayId, departmentId } = await admitPatient(db, auth.hospitalId, auth.userId, input);
  announce(auth.hospitalId, departmentId);
  res.status(201).json({ stayId });
});

wardRouter.post('/stays/:id/move', async (req, res) => {
  const { auth, db } = session(req);
  const { id } = idParam.parse(req.params);
  const { bedId } = moveStaySchema.parse(req.body);
  const { departmentId } = await moveStay(db, auth.hospitalId, auth.userId, id, bedId);
  announce(auth.hospitalId, departmentId);
  res.json({ ok: true });
});

wardRouter.post('/stays/:id/discharge', async (req, res) => {
  const { auth, db } = session(req);
  const { id } = idParam.parse(req.params);
  const input = dischargeStaySchema.parse(req.body ?? {});
  const { departmentId } = await dischargeStay(db, auth.hospitalId, auth.userId, id, input);
  announce(auth.hospitalId, departmentId);
  res.json({ ok: true });
});

wardRouter.post('/beds/:id/status', async (req, res) => {
  const { auth, db } = session(req);
  const { id } = idParam.parse(req.params);
  const input = wardBedStatusSchema.parse(req.body);
  const { departmentId } = await setWardBedStatus(db, auth.hospitalId, auth.userId, id, input);
  announce(auth.hospitalId, departmentId);
  res.json({ ok: true });
});
