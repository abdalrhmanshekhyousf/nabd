import type { ErrorRequestHandler, RequestHandler } from 'express';
import { env } from '../config/env.js';

// Throw this from any route to send a specific status and message to the client.
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const notFound: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = err instanceof HttpError ? err.status : 500;

  if (status >= 500 && !env.isTest) {
    console.error(err);
  }

  // Hide internal error details from clients in production.
  const message =
    status >= 500 && env.isProduction ? 'Internal server error' : (err as Error).message;

  res.status(status).json({ error: { message } });
};
