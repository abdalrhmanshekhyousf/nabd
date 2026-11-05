import {
  operatingRoomSchema,
  operatingRoomServiceSchema,
  OPERATING_ROOM_STATUSES,
} from '@nabd/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { session } from '../middleware/auth.js';
import * as operatingRoomService from '../services/operatingRoom.service.js';
import { orActorsOf, transitionRoom } from '../services/orTransition.service.js';
import { roomHistory } from '../services/roomStatus.service.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';

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

/** Which of the room steps I may take (task 2.19), for the screens to show the right buttons. */
export async function myActors(req: Request, res: Response) {
  const { auth, db } = session(req);
  res.json({ actors: await orActorsOf(db, auth.userId) });
}

/** One step of an operating room's cycle, by whoever the state machine allows (task 2.19). */
export async function transition(req: Request, res: Response) {
  const { auth, db } = session(req);
  const { id } = idParam.parse(req.params);
  const { to } = z
    .object({ to: z.enum(OPERATING_ROOM_STATUSES, 'validation.required') })
    .parse(req.body);
  const operatingRoom = await transitionRoom(db, {
    hospitalId: auth.hospitalId,
    userId: auth.userId,
    roomId: id,
    to,
  });
  // Every screen showing the rooms (the live board, 2.26) updates.
  emitRefresh(rooms.hospital(auth.hospitalId), [['operating-rooms']]);
  res.json({ operatingRoom });
}
