import type { ErrorCode } from '@nabd/shared';
import type { ErrorRequestHandler, Request, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import { errorMessage, type Language } from '../i18n/errorMessages.js';
import { CrossHospitalWriteError } from '../lib/scopedPrisma.js';

// Error codes are shared with the client (@nabd/shared). The message sent with each
// one is translated (see i18n/errorMessages.ts) into the language the client asked for.
export type { ErrorCode };

// Throw this from any route to send a specific status and code to the client.
// `message` is for developers (logs, non-production responses), not for users.
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

/** Arabic unless the client prefers English (Accept-Language). */
function languageOf(req: Request): Language {
  return req.acceptsLanguages('ar', 'en') === 'en' ? 'en' : 'ar';
}

export const notFound: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, 'NOT_FOUND', `Route not found: ${req.method} ${req.originalUrl}`));
};

function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  if (err instanceof ZodError) {
    return new HttpError(
      400,
      'VALIDATION_ERROR',
      'Invalid request data',
      err.issues.map(({ path, code, message }) => ({ path, code, message })),
    );
  }
  // update/delete of a record that doesn't exist (or belongs to another hospital)
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    return new HttpError(404, 'NOT_FOUND', err.message);
  }
  if (err instanceof CrossHospitalWriteError) {
    console.error(err);
    return new HttpError(403, 'FORBIDDEN', err.message);
  }
  if (!env.isTest) console.error(err);
  return new HttpError(500, 'INTERNAL_ERROR', (err as Error)?.message ?? 'Unknown error');
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const error = toHttpError(err);
  res.status(error.status).json({
    error: {
      code: error.code,
      message: errorMessage(error.code, languageOf(req)),
      details: error.details,
      // The developer-facing reason, never shown in production.
      ...(env.isProduction ? {} : { debug: error.message }),
    },
  });
};
