import { preferencesSchema } from '@nabd/shared';
import type { Request, Response } from 'express';
import { session } from '../middleware/auth.js';
import * as meService from '../services/me.service.js';

export async function getMe(req: Request, res: Response) {
  const { auth, db } = session(req);
  res.json({ user: await meService.getMe(db, auth.userId) });
}

export async function updatePreferences(req: Request, res: Response) {
  const { auth, db } = session(req);
  const preferences = preferencesSchema.parse(req.body);
  res.json({ user: await meService.updatePreferences(db, auth.userId, preferences) });
}
