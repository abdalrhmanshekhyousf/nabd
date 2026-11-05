import {
  operatingRoomSchema,
  operatingRoomServiceSchema,
  OPERATING_ROOM_STATUSES,
} from '@nabd/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { session } from '../middleware/auth.js';
import { HttpError } from '../middleware/errorHandler.js';
import { orBoard } from '../services/booking.service.js';
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

/** The operating room nurse's board (task 2.22); the admin sees it too. */
export async function board(req: Request, res: Response) {
  const { auth, db } = session(req);
  const actors = await orActorsOf(db, auth.userId);
  if (!actors.includes('OR_NURSE') && !actors.includes('ADMIN')) {
    throw new HttpError(403, 'FORBIDDEN', 'The board is for the operating room team');
  }
  res.json({ rooms: await orBoard(db, auth.userId) });
}

/** One step of an operating room's cycle, by whoever the state machine allows (task 2.19). */
export async function transition(req: Request, res: Response) {
  const { auth, db } = session(req);
  const { id } = idParam.parse(req.params);
  const { to, bookingId } = z
    .object({
      to: z.enum(OPERATING_ROOM_STATUSES, 'validation.required'),
      // Which waiting booking to prepare for (task 2.22); the first one if left out.
      bookingId: z.uuid().nullable().default(null),
    })
    .parse(req.body);
  const operatingRoom = await transitionRoom(db, {
    hospitalId: auth.hospitalId,
    userId: auth.userId,
    roomId: id,
    to,
    bookingId,
  });
  // Every screen showing the rooms or bookings (the live board, 2.26) updates.
  emitRefresh(rooms.hospital(auth.hospitalId), [['operating-rooms'], ['bookings']]);
  res.json({ operatingRoom });
}
