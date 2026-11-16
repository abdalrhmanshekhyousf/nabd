import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { HttpError } from './errorHandler.js';

type Window = { count: number; resetAt: number };

/**
 * A small in-memory limiter (task 4.23): at most `max` tries per key within
 * `windowMs`, then 429 until the window ends. The key is the address, plus
 * the email for logins, so one person guessing passwords is stopped without
 * locking out a whole office behind the same address.
 */
export function rateLimit({
  max,
  windowMs,
  key,
}: {
  max: number;
  windowMs: number;
  key: (req: Request) => string;
}) {
  const windows = new Map<string, Window>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    // Forget windows that ended, now and then, so the map stays small.
    if (windows.size > 10_000) {
      for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
    }
    const id = key(req);
    const current = windows.get(id);
    const window =
      current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };
    window.count += 1;
    windows.set(id, window);
    if (window.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((window.resetAt - now) / 1000)));
      next(new HttpError(429, 'TOO_MANY_REQUESTS', 'Too many tries, wait a little'));
      return;
    }
    next();
  };
}

const address = (req: Request) => req.ip ?? 'unknown';
const emailOf = (req: Request) =>
  typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

/** 10 sign-in tries per email and address every 15 minutes. */
export const loginLimit = rateLimit({
  max: env.isTest ? 1000 : 10,
  windowMs: 15 * 60_000,
  key: (req) => `${address(req)}|${emailOf(req)}`,
});

/** 20 new accounts per address an hour. */
export const registerLimit = rateLimit({
  max: env.isTest ? 1000 : 20,
  windowMs: 60 * 60_000,
  key: address,
});
