import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import { CrossHospitalWriteError } from '../lib/scopedPrisma.js';

// Stable, machine-readable error codes. The client translates them, so the
// message here is only a developer-facing fallback.
export type ErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'HOSPITAL_REQUIRED'
  | 'ACCOUNT_DISABLED'
  | 'INVALID_REFRESH_TOKEN'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR';

// Throw this from any route to send a specific status and code to the client.
export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  /** Extra data for the client, e.g. the hospitals to choose from. */
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string = code, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, 'NOT_FOUND', `Route not found: ${req.method} ${req.originalUrl}`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.issues.map(({ path, code, message }) => ({ path, code, message })),
      },
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  // update/delete of a record that doesn't exist (or belongs to another hospital)
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
    return;
  }
  if (err instanceof CrossHospitalWriteError) {
    console.error(err);
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not allowed' } });
    return;
  }

  if (!env.isTest) {
    console.error(err);
  }
  // Hide internal error details from clients in production.
  const message = env.isProduction ? 'Internal server error' : (err as Error).message;
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
};
