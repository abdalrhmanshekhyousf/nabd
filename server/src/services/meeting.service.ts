import type { MeetingAnswerData, MeetingData, MeetingView } from '@nabd/shared';
import { Prisma } from '../generated/prisma/client.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { sendNotification } from './notification.service.js';

const meetingInclude = {
  doctor: { select: { id: true, fullName: true } },
  calledBy: { select: { id: true, fullName: true } },
} as const satisfies Prisma.MeetingInclude;

type MeetingRow = Prisma.MeetingGetPayload<{ include: typeof meetingInclude }>;

function toMeetingView(row: MeetingRow): MeetingView {
  return {
    id: row.id,
    startsAt: row.startsAt.toISOString(),
    topic: row.topic,
    status: row.status,
    response: row.response,
    createdAt: row.createdAt.toISOString(),
    doctor: row.doctor,
    calledBy: row.calledBy,
  };
}

/** The admin's meetings (task 4.10): what is coming first, then the last ones. */
export async function hospitalMeetings(db: ScopedPrisma) {
  const now = new Date();
  const [upcoming, past] = await Promise.all([
    db.meeting.findMany({
      where: { startsAt: { gte: now } },
      include: meetingInclude,
      orderBy: { startsAt: 'asc' },
    }),
    db.meeting.findMany({
      where: { startsAt: { lt: now } },
      include: meetingInclude,
      orderBy: { startsAt: 'desc' },
      take: 20,
    }),
  ]);
  return { upcoming: upcoming.map(toMeetingView), past: past.map(toMeetingView) };
}

/** A doctor's meetings with the administration, coming ones first. */
export async function myMeetings(db: ScopedPrisma, doctorId: string) {
  const rows = await db.meeting.findMany({
    where: { doctorId, startsAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
    include: meetingInclude,
    orderBy: { startsAt: 'asc' },
  });
  return rows.map(toMeetingView);
}

/** The admin asks a doctor to meet at a time (task 4.10); the doctor is told. */
export async function callMeeting(
  db: ScopedPrisma,
  hospitalId: string,
  adminId: string,
  { doctorId, startsAt, topic }: MeetingData,
) {
  if (Date.parse(startsAt) <= Date.now()) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Pick a time to come', {
      issues: [{ path: ['startsAt'], message: 'validation.invalid' }],
    });
  }
  const doctor = await db.user.findFirst({
    where: { id: doctorId, role: 'DOCTOR', isActive: true },
    select: { id: true },
  });
  if (!doctor) throw new HttpError(404, 'NOT_FOUND', 'Doctor not found');
  const row = await db.meeting.create({
    data: { hospitalId, calledById: adminId, doctorId, startsAt: new Date(startsAt), topic },
    include: meetingInclude,
  });
  await sendNotification(db, hospitalId, {
    to: { userIds: [doctorId] },
    type: 'MEETING_REQUEST',
    data: { topic, startsAt },
    link: '/doctor/meetings',
  });
  return toMeetingView(row);
}

/** The doctor accepts or declines (with a word); the admin who asked is told. */
export async function answerMeeting(
  db: ScopedPrisma,
  hospitalId: string,
  doctorId: string,
  id: string,
  { answer, response }: MeetingAnswerData,
) {
  const { count } = await db.meeting.updateMany({
    where: { id, doctorId, status: { in: ['REQUESTED', 'ACCEPTED', 'DECLINED'] } },
    data: { status: answer, response },
  });
  if (count === 0) throw new HttpError(404, 'NOT_FOUND', 'Meeting not found');
  const row = await db.meeting.findUniqueOrThrow({ where: { id }, include: meetingInclude });
  if (row.calledBy) {
    await sendNotification(db, hospitalId, {
      to: { userIds: [row.calledBy.id] },
      type: 'REQUEST_DECIDED',
      data: { kind: 'meeting', decision: answer, doctor: row.doctor.fullName, note: response },
      link: '/admin/meetings',
    });
  }
  return toMeetingView(row);
}

/** The admin calls a meeting off; the doctor is told. */
export async function cancelMeeting(db: ScopedPrisma, hospitalId: string, id: string) {
  const { count } = await db.meeting.updateMany({
    where: { id, status: { not: 'CANCELLED' }, startsAt: { gt: new Date() } },
    data: { status: 'CANCELLED' },
  });
  if (count === 0)
    throw new HttpError(409, 'INVALID_TRANSITION', 'This meeting cannot be cancelled');
  const row = await db.meeting.findUniqueOrThrow({ where: { id }, include: meetingInclude });
  await sendNotification(db, hospitalId, {
    to: { userIds: [row.doctor.id] },
    type: 'MEETING_REQUEST',
    data: { topic: row.topic, startsAt: row.startsAt.toISOString(), cancelled: 'yes' },
    link: '/doctor/meetings',
  });
  return toMeetingView(row);
}
