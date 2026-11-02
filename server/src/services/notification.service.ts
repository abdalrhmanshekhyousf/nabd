import {
  REALTIME_EVENTS,
  URGENT_NOTIFICATION_TYPES,
  type NotificationData,
  type NotificationItem,
  type NotificationType,
} from '@nabd/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { Role } from '../generated/prisma/enums.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { emitTo, rooms } from '../realtime/realtime.js';

/**
 * Who should get it: named people, everyone with a role, or everyone with a
 * role in one department (a cleaner counts for every department they cover).
 */
export type Recipients = { userIds: string[] } | { role: Role; departmentId?: string };

export type NewNotification = {
  to: Recipients;
  type: NotificationType;
  data?: NotificationData;
  link?: string | null;
};

const itemSelect = {
  id: true,
  userId: true,
  type: true,
  data: true,
  urgent: true,
  link: true,
  readAt: true,
  createdAt: true,
} as const;

type Row = Prisma.NotificationGetPayload<{ select: typeof itemSelect }>;

function toItem({ userId: _userId, ...row }: Row): NotificationItem {
  return {
    ...row,
    data: row.data as NotificationData,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Active people of this hospital matching `to`. */
async function resolveRecipients(db: ScopedPrisma, to: Recipients) {
  const where: Prisma.UserWhereInput =
    'userIds' in to
      ? { id: { in: to.userIds } }
      : {
          role: to.role,
          ...(to.departmentId && {
            OR: [
              { staffProfile: { departmentId: to.departmentId } },
              { cleanerAssignments: { some: { departmentId: to.departmentId } } },
            ],
          }),
        };
  const users = await db.user.findMany({
    where: { ...where, isActive: true },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

/**
 * The one way to notify anyone (task 2.2): saves a row per recipient, then
 * pushes it live to each of them. Returns the saved notifications.
 */
export async function sendNotification(
  db: ScopedPrisma,
  hospitalId: string,
  { to, type, data = {}, link = null }: NewNotification,
) {
  const userIds = await resolveRecipients(db, to);
  if (userIds.length === 0) return [];

  const urgent = URGENT_NOTIFICATION_TYPES.includes(type);
  const rows = await db.notification.createManyAndReturn({
    data: userIds.map((userId) => ({ hospitalId, userId, type, data, urgent, link })),
    select: itemSelect,
  });

  for (const row of rows) {
    emitTo(rooms.user(row.userId), REALTIME_EVENTS.notification, toItem(row));
  }
  return rows.map(toItem);
}

/** The latest notifications of one person, with how many are unread (for the bell, 2.4). */
export async function listNotifications(db: ScopedPrisma, userId: string, take = 30) {
  const [rows, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId },
      select: itemSelect,
      orderBy: { createdAt: 'desc' },
      take,
    }),
    db.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { notifications: rows.map(toItem), unread };
}
