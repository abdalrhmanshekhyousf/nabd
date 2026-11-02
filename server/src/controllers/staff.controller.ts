import { createStaffSchema, staffFilterSchema, updateStaffSchema } from '@nabd/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { session } from '../middleware/auth.js';
import { syncUserRooms } from '../realtime/realtime.js';
import * as staffService from '../services/staff.service.js';

const idParam = z.object({ id: z.uuid() });

export async function list(req: Request, res: Response) {
  const { db } = session(req);
  const filter = staffFilterSchema.parse(req.query);
  res.json({ staff: await staffService.listStaff(db, filter) });
}

export async function create(req: Request, res: Response) {
  const { auth, db } = session(req);
  const input = createStaffSchema.parse(req.body);
  res.status(201).json({ member: await staffService.createStaff(db, auth.hospitalId, input) });
}

export async function update(req: Request, res: Response) {
  const { auth, db } = session(req);
  const { id } = idParam.parse(req.params);
  const input = updateStaffSchema.parse(req.body);
  const member = await staffService.updateStaff(db, auth.hospitalId, id, input);
  // A new role, department or a suspension changes what they may hear live.
  await syncUserRooms(id);
  res.json({ member });
}

export async function remove(req: Request, res: Response) {
  const { db } = session(req);
  const { id } = idParam.parse(req.params);
  await staffService.deleteStaff(db, id);
  await syncUserRooms(id);
  res.status(204).end();
}
