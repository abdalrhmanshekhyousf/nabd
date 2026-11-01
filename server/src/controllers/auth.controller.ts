import type { CookieOptions, Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import * as authService from '../services/auth.service.js';

// The refresh token lives in an httpOnly cookie: page scripts can never read it,
// and it is only sent to the auth routes.
export const REFRESH_COOKIE = 'nabd_refresh';
const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.isProduction,
  sameSite: 'strict',
  path: '/api/auth',
};

const loginBody = z.object({
  // Trim and lowercase before checking, so " Admin@Nabd.Demo" signs in too.
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(1).max(200),
  hospitalId: z.uuid().optional(),
});

function context(req: Request) {
  return { userAgent: req.get('user-agent') };
}

function sendSession(res: Response, session: authService.AuthSession) {
  res.cookie(REFRESH_COOKIE, session.refreshToken, {
    ...cookieOptions,
    expires: session.refreshTokenExpiresAt,
  });
  res.json({
    accessToken: session.accessToken,
    expiresIn: env.accessTokenTtlSeconds,
    user: session.user,
  });
}

export async function login(req: Request, res: Response) {
  const input = loginBody.parse(req.body);
  sendSession(res, await authService.login(input, context(req)));
}

export async function refresh(req: Request, res: Response) {
  try {
    sendSession(res, await authService.refresh(req.cookies?.[REFRESH_COOKIE], context(req)));
  } catch (error) {
    // A dead refresh token is useless; drop it so the browser stops sending it.
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    throw error;
  }
}

export async function logout(req: Request, res: Response) {
  await authService.logout(req.cookies?.[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  res.status(204).end();
}
