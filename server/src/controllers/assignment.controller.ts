import { assignCleanerSchema, assignNurseSchema } from '@nabd/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { session } from '../middleware/auth.js';
import { syncUserRooms } from '../realtime/realtime.js';
import * as assignmentService from '../services/assignment.service.js';

const idParam = z.object({ id: z.uuid() });

export async function list(req: Request, res: Response) {
  const { db } = session(req);
  res.json(await assignmentService.getAssignments(db));
}

export async function assignNurse(req: Request, res: Response) {
  const { auth, db } = session(req);
  const { id } = idParam.parse(req.params);
  const input = assignNurseSchema.parse(req.body);
  const nurse = await assignmentService.assignNurse(db, auth.hospitalId, id, input);
  await syncUserRooms(id);
  res.json({ nurse });
}

export async function assignCleaner(req: Request, res: Response) {
  const { auth, db } = session(req);
  const { id } = idParam.parse(req.params);
  const input = assignCleanerSchema.parse(req.body);
  const cleaner = await assignmentService.assignCleaner(db, auth.hospitalId, id, input);
  await syncUserRooms(id);
  res.json({ cleaner });
}
