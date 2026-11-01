import type { Request, Response } from 'express';
import { z } from 'zod';
import { session } from '../middleware/auth.js';
import * as meService from '../services/me.service.js';

const preferencesBody = z
  .object({
    language: z.enum(['AR', 'EN']).optional(),
    theme: z.enum(['LIGHT', 'DARK', 'SYSTEM']).optional(),
  })
  .strict()
  .refine((body) => body.language !== undefined || body.theme !== undefined, {
    message: 'Send language and/or theme',
  });

export async function getMe(req: Request, res: Response) {
  const { auth, db } = session(req);
  res.json({ user: await meService.getMe(db, auth.userId) });
}

export async function updatePreferences(req: Request, res: Response) {
  const { auth, db } = session(req);
  const preferences = preferencesBody.parse(req.body);
  res.json({ user: await meService.updatePreferences(db, auth.userId, preferences) });
}
