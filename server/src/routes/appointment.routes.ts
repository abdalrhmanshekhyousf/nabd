import { bookAppointmentSchema, slotsQuerySchema } from '@nabd/shared';
import { Router } from 'express';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import { bookAppointment, freeSlots } from '../services/appointment.service.js';

// Appointments (task 3.20): a doctor's free slots, and booking one. Patients
// book for themselves (3.22), reception and the admin for a patient (4.2).
export const appointmentRouter = Router();

appointmentRouter.use(authenticate);

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
  // Whoever is choosing a slot with this doctor sees it go.
  emitRefresh(rooms.hospital(auth.hospitalId), [['slots', input.doctorId]]);
  if (appointment.doctorId) emitRefresh(rooms.user(appointment.doctorId), [['appointments']]);
  res.status(201).json({ appointment });
});
