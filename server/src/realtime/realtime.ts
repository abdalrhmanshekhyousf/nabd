import type { Server as HttpServer } from 'node:http';
import { REALTIME_EVENTS, type RefreshPayload } from '@nabd/shared';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { env } from '../config/env.js';
import type { Role } from '../generated/prisma/enums.js';
import { prisma } from '../lib/prisma.js';
import { verifyAccessToken } from '../lib/tokens.js';

/**
 * Socket.io rooms (task 2.1). Every connection joins its hospital, its own
 * user room, its role within the hospital, and each department it works in
 * (a cleaner covers several). Events are sent to rooms, never broadcast, so
 * nothing crosses from one hospital to another.
 */
export const rooms = {
  hospital: (hospitalId: string) => `hospital:${hospitalId}`,
  user: (userId: string) => `user:${userId}`,
  role: (hospitalId: string, role: Role) => `role:${hospitalId}:${role}`,
  department: (departmentId: string) => `department:${departmentId}`,
};

type SocketUser = { id: string; hospitalId: string; role: Role; departmentIds: string[] };

/** Who is on the other end, read fresh from the database (not just the token). */
async function loadUser(userId: string): Promise<SocketUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      hospitalId: true,
      role: true,
      isActive: true,
      staffProfile: { select: { departmentId: true } },
      cleanerAssignments: { select: { departmentId: true } },
    },
  });
  if (!user?.isActive) return null;
  const departmentIds = new Set(user.cleanerAssignments.map((row) => row.departmentId));
  if (user.staffProfile?.departmentId) departmentIds.add(user.staffProfile.departmentId);
  return {
    id: user.id,
    hospitalId: user.hospitalId,
    role: user.role,
    departmentIds: [...departmentIds],
  };
}

function roomsOf(user: SocketUser) {
  return [
    rooms.hospital(user.hospitalId),
    rooms.user(user.id),
    rooms.role(user.hospitalId, user.role),
    ...user.departmentIds.map(rooms.department),
  ];
}

let io: Server | null = null;

/** Starts Socket.io on the API's HTTP server, on the same port. */
export function attachRealtime(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.clientUrl, credentials: true },
  });

  // Same access token as the API: no token, a bad one, or a disabled account
  // never gets a connection.
  io.use(async (socket, next) => {
    const token: unknown = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !token) return next(new Error('UNAUTHENTICATED'));
    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      return next(new Error('UNAUTHENTICATED'));
    }
    const user = await loadUser(payload.sub);
    if (!user || user.hospitalId !== payload.hospitalId) return next(new Error('UNAUTHENTICATED'));
    socket.data.user = user;
    // The connection lives only as long as the token; the client reconnects
    // with a fresh one (task 2.3).
    const { exp } = jwt.decode(token) as { exp: number };
    socket.data.expiresAt = exp * 1000;
    next();
  });

  io.on('connection', async (socket) => {
    const timer = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, (socket.data.expiresAt as number) - Date.now()),
    );
    socket.on('disconnect', () => clearTimeout(timer));
    const joined = roomsOf(socket.data.user as SocketUser);
    await socket.join(joined);
    socket.emit('ready', { rooms: joined });
  });

  return io;
}

/** Sends an event to one or more rooms. Does nothing while Socket.io is not running. */
export function emitTo(room: string | string[], event: string, payload: unknown) {
  io?.to(room).emit(event, payload);
}

/** Tells open screens in these rooms that some data changed, so they fetch it again. */
export function emitRefresh(room: string | string[], queryKeys: RefreshPayload['queryKeys']) {
  emitTo(room, REALTIME_EVENTS.refresh, { queryKeys } satisfies RefreshPayload);
}

/**
 * Called after an admin changes an employee (role, department, suspension,
 * removal): open connections move to the right rooms at once, or close when
 * the account can no longer sign in.
 */
export async function syncUserRooms(userId: string) {
  if (!io) return;
  const sockets = await io.in(rooms.user(userId)).fetchSockets();
  if (sockets.length === 0) return;
  const user = await loadUser(userId);
  for (const remote of sockets) {
    if (!user) {
      remote.disconnect(true);
      continue;
    }
    const wanted = new Set(roomsOf(user));
    for (const room of remote.rooms) {
      if (room !== remote.id && !wanted.has(room)) remote.leave(room);
    }
    remote.join([...wanted]);
    remote.data.user = user;
  }
}

/** Stops Socket.io (graceful shutdown and tests). */
export async function closeRealtime() {
  await io?.close();
  io = null;
}
