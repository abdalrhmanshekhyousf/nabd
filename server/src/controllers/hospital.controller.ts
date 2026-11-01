import { updateHospitalSchema } from '@nabd/shared';
import type { Request, Response } from 'express';
import { session } from '../middleware/auth.js';
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
