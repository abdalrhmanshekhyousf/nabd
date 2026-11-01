import { updateHospitalSchema } from '@nabd/shared';
import type { Request, Response } from 'express';
import { session } from '../middleware/auth.js';
import { HttpError } from '../middleware/errorHandler.js';
import * as hospitalService from '../services/hospital.service.js';

export async function getHospital(req: Request, res: Response) {
  const { db } = session(req);
  res.json({ hospital: await hospitalService.getHospital(db) });
}

export async function updateHospital(req: Request, res: Response) {
  const { auth, db } = session(req);
  const info = updateHospitalSchema.parse(req.body);
  res.json({ hospital: await hospitalService.updateHospital(db, auth.hospitalId, info) });
}

export async function uploadLogo(req: Request, res: Response) {
  const { auth, db } = session(req);
  if (!req.file) throw new HttpError(400, 'FILE_REQUIRED');
  res.json({ hospital: await hospitalService.uploadLogo(db, auth.hospitalId, req.file) });
}

export async function deleteLogo(req: Request, res: Response) {
  const { auth, db } = session(req);
  res.json({ hospital: await hospitalService.deleteLogo(db, auth.hospitalId) });
}

export async function getLogo(req: Request, res: Response) {
  const { db } = session(req);
  const { path, type } = await hospitalService.logoFile(db);
  // Private to the signed-in staff of this hospital; the versioned URL makes a
  // long cache safe because a new logo gets a new URL.
  res.set({
    'Content-Type': type,
    'Cache-Control': 'private, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'",
  });
  res.sendFile(path);
}
