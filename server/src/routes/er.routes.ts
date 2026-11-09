import {
  callDoctorSchema,
  dischargeSchema,
  erStatusSchema,
  transferSchema,
  overrideLevelSchema,
  quickRegistrationSchema,
  triageSchema,
} from '@nabd/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import {
  callDoctor,
  cancelCall,
  dischargeVisit,
  erDepartmentOf,
  getQueue,
  getVisit,
  listDoctors,
  overrideLevel,
  registerArrival,
  requireErNurse,
  saveTriage,
  setErStatus,
  transferVisit,
} from '../services/er.service.js';

// The emergency room (phase 2): emergency nurses only.
export const erRouter = Router();

erRouter.use(authenticate, requireRole('NURSE'));

/** Whether I can work the emergency room (my department is the ER). */
erRouter.get('/me', async (req, res) => {
  const { auth, db } = session(req);
  res.json({ canRegister: (await erDepartmentOf(db, auth.userId)) !== null });
});

/** Quick registration of an arrival, known or unidentified (task 2.11). */
erRouter.post('/visits', async (req, res) => {
  const { auth, db } = session(req);
  const departmentId = await requireErNurse(db, auth.userId);
  const input = quickRegistrationSchema.parse(req.body);
  const visit = await registerArrival(db, auth.hospitalId, auth.userId, input);
  // The waiting list (2.15) of the emergency department updates live.
  emitRefresh(rooms.department(departmentId), [['er-queue']]);
  res.status(201).json({ visit });
});

const visitParam = z.object({ id: z.uuid() });

/** The waiting list, live through refresh events on [['er-queue']] (task 2.15). */
erRouter.get('/queue', async (req, res) => {
  const { auth, db } = session(req);
  await requireErNurse(db, auth.userId);
  res.json({ visits: await getQueue(db) });
});

erRouter.get('/visits/:id', async (req, res) => {
  const { auth, db } = session(req);
  await requireErNurse(db, auth.userId);
  const { id } = visitParam.parse(req.params);
  res.json({ visit: await getVisit(db, id) });
});

/** The triage form: complaint, vital signs, consciousness, pain (task 2.12). */
erRouter.put('/visits/:id/triage', async (req, res) => {
  const { auth, db } = session(req);
  const departmentId = await requireErNurse(db, auth.userId);
  const { id } = visitParam.parse(req.params);
  const input = triageSchema.parse(req.body);
  const visit = await saveTriage(db, auth.userId, id, input);
  emitRefresh(rooms.department(departmentId), [['er-queue'], ['er-visit', id]]);
  res.json({ visit });
});

/** The nurse sets another level than suggested, with a reason (task 2.14). */
erRouter.put('/visits/:id/level', async (req, res) => {
  const { auth, db } = session(req);
  const departmentId = await requireErNurse(db, auth.userId);
  const { id } = visitParam.parse(req.params);
  const input = overrideLevelSchema.parse(req.body);
  const visit = await overrideLevel(db, auth.userId, id, input);
  emitRefresh(rooms.department(departmentId), [['er-queue'], ['er-visit', id]]);
  res.json({ visit });
});

/** Doctors with their live status, for calling one (task 2.16; refreshed on [['doctors']]). */
erRouter.get('/doctors', async (req, res) => {
  const { auth, db } = session(req);
  await requireErNurse(db, auth.userId);
  res.json({ doctors: await listDoctors(db) });
});

/** Calls a specific, available doctor to the patient (task 2.16). */
erRouter.post('/visits/:id/calls', async (req, res) => {
  const { auth, db } = session(req);
  const departmentId = await requireErNurse(db, auth.userId);
  const { id } = visitParam.parse(req.params);
  const { doctorId } = callDoctorSchema.parse(req.body);
  const call = await callDoctor(db, auth.hospitalId, auth.userId, id, doctorId);
  emitRefresh(rooms.department(departmentId), [['er-queue'], ['er-visit', id]]);
  emitRefresh(rooms.user(doctorId), [['doctor-calls']]);
  res.status(201).json({ call });
});

erRouter.delete('/visits/:id/calls/:callId', async (req, res) => {
  const { auth, db } = session(req);
  const departmentId = await requireErNurse(db, auth.userId);
  const { id, callId } = z.object({ id: z.uuid(), callId: z.uuid() }).parse(req.params);
  const call = await cancelCall(db, id, callId);
  emitRefresh(rooms.department(departmentId), [['er-queue'], ['er-visit', id]]);
  if (call.doctorId) emitRefresh(rooms.user(call.doctorId), [['doctor-calls']]);
  res.json({ call });
});

// The patient's course in the ER: treated, then transferred or discharged (task 2.17).
erRouter.put('/visits/:id/status', async (req, res) => {
  const { auth, db } = session(req);
  const departmentId = await requireErNurse(db, auth.userId);
  const { id } = visitParam.parse(req.params);
  const { status } = erStatusSchema.parse(req.body);
  const visit = await setErStatus(db, id, status);
  emitRefresh(rooms.department(departmentId), [['er-queue'], ['er-visit', id]]);
  res.json({ visit });
});

/** Tells everyone concerned that the visit left the ER. */
function announceClosed(
  erDepartmentId: string,
  { visit, withdrawnDoctorIds }: { visit: { id: string }; withdrawnDoctorIds: string[] },
  wardId?: string,
) {
  emitRefresh(rooms.department(erDepartmentId), [['er-queue'], ['er-visit', visit.id]]);
  for (const doctorId of withdrawnDoctorIds) emitRefresh(rooms.user(doctorId), [['doctor-calls']]);
  // The ward's screens (bed admission, 3.16) pick up the new arrival.
  if (wardId) emitRefresh(rooms.department(wardId), [['ward']]);
}

erRouter.post('/visits/:id/transfer', async (req, res) => {
  const { auth, db } = session(req);
  const departmentId = await requireErNurse(db, auth.userId);
  const { id } = visitParam.parse(req.params);
  const input = transferSchema.parse(req.body);
  const result = await transferVisit(db, id, input);
  announceClosed(departmentId, result, input.departmentId);
  res.json({ visit: result.visit });
});

erRouter.post('/visits/:id/discharge', async (req, res) => {
  const { auth, db } = session(req);
  const departmentId = await requireErNurse(db, auth.userId);
  const { id } = visitParam.parse(req.params);
  const input = dischargeSchema.parse(req.body ?? {});
  const result = await dischargeVisit(db, id, input);
  announceClosed(departmentId, result);
  res.json({ visit: result.visit });
});
