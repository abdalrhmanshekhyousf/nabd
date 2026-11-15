import type { ComplaintData, ComplaintView } from '@nabd/shared';
import { Prisma } from '../generated/prisma/client.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { sendNotification } from './notification.service.js';

export const complaintInclude = {
  user: { select: { id: true, fullName: true } },
  department: { select: { id: true, name: true, code: true } },
  repliedBy: { select: { fullName: true } },
} as const satisfies Prisma.ComplaintInclude;

type ComplaintRow = Prisma.ComplaintGetPayload<{ include: typeof complaintInclude }>;

export function toComplaintView(row: ComplaintRow): ComplaintView {
  return {
    id: row.id,
    subject: row.subject,
    body: row.body,
    status: row.status,
    reply: row.reply,
    repliedAt: row.repliedAt?.toISOString() ?? null,
    repliedByName: row.repliedBy?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
    author: row.user,
    department: row.department,
  };
}

/** My complaints, newest first (task 4.8). */
export async function myComplaints(db: ScopedPrisma, userId: string) {
  const rows = await db.complaint.findMany({
    where: { userId },
    include: complaintInclude,
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map(toComplaintView);
}

/** A patient complains to the administration (task 4.8); the admins are told. */
export async function fileComplaint(
  db: ScopedPrisma,
  hospitalId: string,
  userId: string,
  { departmentId, subject, body }: ComplaintData,
) {
  const department = departmentId
    ? await db.department.findUnique({ where: { id: departmentId }, select: { id: true } })
    : null;
  const row = await db.complaint.create({
    data: { hospitalId, userId, departmentId: department?.id ?? null, subject, body },
    include: complaintInclude,
  });
  await sendNotification(db, hospitalId, {
    to: { role: 'ADMIN' },
    type: 'COMPLAINT',
    data: { subject, name: row.user.fullName },
    link: '/admin/complaints',
  });
  return toComplaintView(row);
}
