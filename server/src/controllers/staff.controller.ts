import { createStaffSchema } from '@nabd/shared';
import type { Request, Response } from 'express';
import { session } from '../middleware/auth.js';
import * as staffService from '../services/staff.service.js';

export async function list(req: Request, res: Response) {
  const { db } = session(req);
  res.json({ staff: await staffService.listStaff(db) });
}

export async function create(req: Request, res: Response) {
  const { auth, db } = session(req);
  const input = createStaffSchema.parse(req.body);
  res.status(201).json({ member: await staffService.createStaff(db, auth.hospitalId, input) });
}
