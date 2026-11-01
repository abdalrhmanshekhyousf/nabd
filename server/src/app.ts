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
  app.use('/api/me', meRouter);
  app.use('/api/hospital', hospitalRouter);
  app.use('/api/departments', departmentRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
