import { loginSchema, registerHospitalSchema, registerPatientSchema } from '@nabd/shared';
import type { CookieOptions, Request, Response } from 'express';
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
  // Same rules as the login form (@nabd/shared).
  const input = loginSchema.parse(req.body);
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

export async function register(req: Request, res: Response) {
  const input = registerHospitalSchema.parse(req.body);
  res.status(201);
  sendSession(res, await authService.registerHospital(input, context(req)));
}

export async function registerPatient(req: Request, res: Response) {
  const input = registerPatientSchema.parse(req.body);
  res.status(201);
  sendSession(res, await authService.registerPatient(input, context(req)));
}
