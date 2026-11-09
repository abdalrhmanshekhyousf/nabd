import {
  bedServiceSchema,
  createBedSchema,
  createRoomSchema,
  updateRoomSchema,
} from '@nabd/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { session } from '../middleware/auth.js';
import * as roomService from '../services/room.service.js';
import { bedHistory } from '../services/bedStatus.service.js';

const idParam = z.object({ id: z.uuid() });
const listQuery = z.object({ departmentId: z.uuid().optional() });

export async function list(req: Request, res: Response) {
  const { db } = session(req);
  const { departmentId } = listQuery.parse(req.query);
  res.json({ rooms: await roomService.listRooms(db, departmentId) });
}

export async function create(req: Request, res: Response) {
  const { auth, db } = session(req);
  const input = createRoomSchema.parse(req.body);
  res.status(201).json({ room: await roomService.createRoom(db, auth.hospitalId, input) });
}

export async function update(req: Request, res: Response) {
  const { db } = session(req);
  const { id } = idParam.parse(req.params);
  res.json({ room: await roomService.updateRoom(db, id, updateRoomSchema.parse(req.body)) });
}

export async function remove(req: Request, res: Response) {
  const { db } = session(req);
  const { id } = idParam.parse(req.params);
  await roomService.deleteRoom(db, id);
  res.status(204).end();
}

export async function addBed(req: Request, res: Response) {
  const { auth, db } = session(req);
  const { id } = idParam.parse(req.params);
  const { label } = createBedSchema.parse(req.body ?? {});
  res.status(201).json({ room: await roomService.addBed(db, auth.hospitalId, id, label) });
}

export async function setBedService(req: Request, res: Response) {
  const { auth, db } = session(req);
  const { id } = idParam.parse(req.params);
  const { outOfService } = bedServiceSchema.parse(req.body);
  res.json({
    room: await roomService.setBedOutOfService(db, auth.hospitalId, auth.userId, id, outOfService),
  });
}

export async function removeBed(req: Request, res: Response) {
  const { db } = session(req);
  const { id } = idParam.parse(req.params);
  await roomService.deleteBed(db, id);
  res.status(204).end();
}

/** A bed's history of states (task 3.15). */
export async function bedStatusHistory(req: Request, res: Response) {
  const { db } = session(req);
  const { id } = idParam.parse(req.params);
  res.json({ history: await bedHistory(db, id) });
}
