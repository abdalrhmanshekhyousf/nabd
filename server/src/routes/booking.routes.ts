import { bookingRangeSchema, createBookingSchema } from '@nabd/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, session } from '../middleware/auth.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import {
  cancelBooking,
  createBooking,
  listBookings,
  myBookings,
} from '../services/booking.service.js';

// Operating room bookings (task 2.20): doctors book, staff see the schedule.
export const bookingRouter = Router();

bookingRouter.use(authenticate);

/** Every screen showing bookings or rooms updates. */
const announce = (hospitalId: string) =>
  emitRefresh(rooms.hospital(hospitalId), [['bookings'], ['operating-rooms']]);

bookingRouter.get('/', requireRole('DOCTOR', 'NURSE', 'ADMIN'), async (req, res) => {
  const { auth, db } = session(req);
  const { from, to } = bookingRangeSchema.parse(req.query);
  res.json({ bookings: await listBookings(db, auth.userId, new Date(from), new Date(to)) });
});

bookingRouter.get('/mine', requireRole('DOCTOR'), async (req, res) => {
  const { auth, db } = session(req);
  res.json({ bookings: await myBookings(db, auth.userId) });
});

bookingRouter.post('/', requireRole('DOCTOR'), async (req, res) => {
  const { auth, db } = session(req);
  const input = createBookingSchema.parse(req.body);
  const booking = await createBooking(db, auth.hospitalId, auth.userId, input);
  announce(auth.hospitalId);
  res.status(201).json({ booking });
});

bookingRouter.delete('/:id', requireRole('DOCTOR'), async (req, res) => {
  const { auth, db } = session(req);
  const { id } = z.object({ id: z.uuid() }).parse(req.params);
  const booking = await cancelBooking(db, auth.hospitalId, auth.userId, id);
  announce(auth.hospitalId);
  res.json({ booking });
});
