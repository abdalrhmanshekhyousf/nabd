import type { AppointmentView } from '@nabd/shared';
import { bookAppointmentSchema, deskDayQuerySchema, slotsQuerySchema } from '@nabd/shared';
import { Router } from 'express';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import { z } from 'zod';
import {
  bookableDepartments,
  bookableDoctors,
  bookAppointment,
  cancelAppointment,
  deskDay,
  freeSlots,
  myAppointments,
  patientAtDesk,
} from '../services/appointment.service.js';
import { chargeAppointment, dropCharge } from '../services/charge.service.js';

// Appointments (task 3.20): a doctor's free slots, and booking one. Patients
// book for themselves (3.22), reception and the admin for a patient (4.2).
export const appointmentRouter = Router();

appointmentRouter.use(authenticate);

/**
 * A visit was booked or cancelled: whoever is choosing a slot with the doctor
 * sees it go or come back, and the doctor, the patient (when they have an
 * account) and the reception desks see their lists change.
 */
async function refreshVisit(db: ScopedPrisma, hospitalId: string, visit: AppointmentView) {
  if (visit.doctorId) {
    emitRefresh(rooms.hospital(hospitalId), [['slots', visit.doctorId]]);
    emitRefresh(rooms.user(visit.doctorId), [['appointments']]);
  }
  for (const role of ['RECEPTIONIST', 'ADMIN'] as const) {
    emitRefresh(rooms.role(hospitalId, role), [['appointments']]);
  }
  const patient = await db.patient.findUnique({
    where: { id: visit.patientId },
    select: { userId: true },
  });
  if (patient?.userId) emitRefresh(rooms.user(patient.userId), [['appointments']]);
}

appointmentRouter.get(
  '/slots',
  requireRole('PATIENT', 'RECEPTIONIST', 'ADMIN', 'DOCTOR'),
  async (req, res) => {
    const { db } = session(req);
    const { doctorId, from, days } = slotsQuerySchema.parse(req.query);
    res.json({ days: await freeSlots(db, doctorId, { from, days }) });
  },
);

appointmentRouter.post('/', requireRole('PATIENT', 'RECEPTIONIST', 'ADMIN'), async (req, res) => {
  const { auth, db } = session(req);
  const input = bookAppointmentSchema.parse(req.body);
  const appointment = await bookAppointment(db, auth.hospitalId, auth, input);
  await chargeAppointment(db, auth.hospitalId, appointment.id);
  await refreshVisit(db, auth.hospitalId, appointment);
  res.status(201).json({ appointment });
});

// The patient's booking (task 3.22): department, then doctor, then slot; and
// their own visits, which they may cancel before they happen.
appointmentRouter.get(
  '/departments',
  requireRole('PATIENT', 'RECEPTIONIST', 'ADMIN'),
  async (req, res) => {
    const { db } = session(req);
    res.json({ departments: await bookableDepartments(db) });
  },
);

appointmentRouter.get(
  '/doctors',
  requireRole('PATIENT', 'RECEPTIONIST', 'ADMIN'),
  async (req, res) => {
    const { db } = session(req);
    const { departmentId } = z.object({ departmentId: z.uuid() }).parse(req.query);
    res.json({ doctors: await bookableDoctors(db, departmentId) });
  },
);

appointmentRouter.get('/mine', requireRole('PATIENT'), async (req, res) => {
  const { auth, db } = session(req);
  res.json(await myAppointments(db, auth.userId));
});

// The reception desk (task 4.2): the hospital's visits of a day, and one
// patient's visits when booking for them.
appointmentRouter.get('/day', requireRole('RECEPTIONIST', 'ADMIN'), async (req, res) => {
  const { db } = session(req);
  const { date } = deskDayQuerySchema.parse(req.query);
  res.json({ appointments: await deskDay(db, date) });
});

appointmentRouter.get(
  '/patient/:patientId',
  requireRole('RECEPTIONIST', 'ADMIN'),
  async (req, res) => {
    const { db } = session(req);
    const { patientId } = z.object({ patientId: z.uuid() }).parse(req.params);
    res.json(await patientAtDesk(db, patientId));
  },
);

appointmentRouter.delete(
  '/:id',
  requireRole('PATIENT', 'RECEPTIONIST', 'ADMIN'),
  async (req, res) => {
    const { auth, db } = session(req);
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    const appointment = await cancelAppointment(db, auth, id);
    await dropCharge(db, 'VISIT', id);
    await refreshVisit(db, auth.hospitalId, appointment);
    res.json({ appointment });
  },
);
