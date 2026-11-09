import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.routes.js';
import { departmentRouter } from './routes/department.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { hospitalRouter } from './routes/hospital.routes.js';
import { meRouter } from './routes/me.routes.js';
import { operatingRoomRouter } from './routes/operatingRoom.routes.js';
import { bedRouter, roomRouter } from './routes/room.routes.js';
import { assignmentRouter } from './routes/assignment.routes.js';
import { bookingRouter } from './routes/booking.routes.js';
import { cleaningRouter } from './routes/cleaning.routes.js';
import { imagingRouter } from './routes/imaging.routes.js';
import { inventoryRouter } from './routes/inventory.routes.js';
import { labRouter } from './routes/lab.routes.js';
import { pharmacyRouter } from './routes/pharmacy.routes.js';
import { reportRouter } from './routes/report.routes.js';
import { devRouter } from './routes/dev.routes.js';
import { doctorRouter } from './routes/doctor.routes.js';
import { erRouter } from './routes/er.routes.js';
import { notificationRouter } from './routes/notification.routes.js';
import { publicRouter } from './routes/public.routes.js';
import { staffRouter } from './routes/staff.routes.js';

// Built separately from index.ts so tests can use the app without opening a port.
export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (!env.isTest) {
    app.use(morgan(env.isProduction ? 'combined' : 'dev'));
  }

  // Feature routers. Signed-in routes use `authenticate` (and `requireRole`), and
  // query through req.db so every query stays inside the caller's hospital.
  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/me', meRouter);
  app.use('/api/hospital', hospitalRouter);
  app.use('/api/departments', departmentRouter);
  app.use('/api/rooms', roomRouter);
  app.use('/api/beds', bedRouter);
  app.use('/api/operating-rooms', operatingRoomRouter);
  app.use('/api/staff', staffRouter);
  app.use('/api/assignments', assignmentRouter);
  app.use('/api/notifications', notificationRouter);
  app.use('/api/doctors', doctorRouter);
  app.use('/api/er', erRouter);
  app.use('/api/bookings', bookingRouter);
  app.use('/api/cleaning-requests', cleaningRouter);
  app.use('/api/inventory', inventoryRouter);
  app.use('/api/lab-tests', labRouter);
  app.use('/api/imaging', imagingRouter);
  app.use('/api/pharmacy', pharmacyRouter);
  app.use('/api/reports', reportRouter);
  if (!env.isProduction) app.use('/api/dev', devRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
