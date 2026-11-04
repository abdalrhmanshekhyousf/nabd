import { operatingRoomSchema, operatingRoomServiceSchema } from '@nabd/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { session } from '../middleware/auth.js';
import * as operatingRoomService from '../services/operatingRoom.service.js';
import { roomHistory } from '../services/roomStatus.service.js';

const idParam = z.object({ id: z.uuid() });

export async function list(req: Request, res: Response) {
  const { db } = session(req);
  res.json({ operatingRooms: await operatingRoomService.listOperatingRooms(db) });
}

export async function create(req: Request, res: Response) {
  const { auth, db } = session(req);
  const { name } = operatingRoomSchema.parse(req.body);
  res.status(201).json({
    operatingRoom: await operatingRoomService.createOperatingRoom(db, auth.hospitalId, name),
  });
}

export async function rename(req: Request, res: Response) {
  const { db } = session(req);
  const { id } = idParam.parse(req.params);
  const { name } = operatingRoomSchema.parse(req.body);
  res.json({ operatingRoom: await operatingRoomService.renameOperatingRoom(db, id, name) });
}

export async function setService(req: Request, res: Response) {
  const { auth, db } = session(req);
  const { id } = idParam.parse(req.params);
  const { outOfService } = operatingRoomServiceSchema.parse(req.body);
  res.json({
    operatingRoom: await operatingRoomService.setOperatingRoomService(
      db,
      auth.hospitalId,
      auth.userId,
      id,
      outOfService,
    ),
  });
}

/** Who changed the room's status, from what to what, and when (task 2.18). */
export async function history(req: Request, res: Response) {
  const { db } = session(req);
  const { id } = idParam.parse(req.params);
  res.json({ history: await roomHistory(db, id) });
}

export async function remove(req: Request, res: Response) {
  const { db } = session(req);
  const { id } = idParam.parse(req.params);
  await operatingRoomService.deleteOperatingRoom(db, id);
  res.status(204).end();
}
