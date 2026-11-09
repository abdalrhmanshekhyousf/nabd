import { canChangeBed, type BedStatus, type BedStatusChangeView } from '@nabd/shared';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';

type Tx = Parameters<Parameters<ScopedPrisma['$transaction']>[0]>[0];

/**
 * The one way a bed changes state (task 3.15): the bed row is locked, the move
 * is checked against BED_TRANSITIONS, and it is written to the bed's history
 * with who made it and, when it belongs to one, the stay. Two nurses at once:
 * the second sees the state the first left and is refused if it no longer fits.
 */
export async function changeBedStatus(
  tx: Tx,
  {
    hospitalId,
    bedId,
    to,
    actorId,
    assignmentId = null,
    reason = null,
  }: {
    hospitalId: string;
    bedId: string;
    to: BedStatus;
    actorId: string;
    assignmentId?: string | null;
    reason?: string | null;
  },
) {
  // One connection per transaction: one query after another.
  const [locked] = await tx.$queryRaw<{ status: BedStatus }[]>`
    SELECT status FROM "Bed" WHERE id = ${bedId}::uuid AND "hospitalId" = ${hospitalId}::uuid FOR UPDATE`;
  if (!locked) throw new HttpError(404, 'NOT_FOUND', 'Bed not found');
  if (!canChangeBed(locked.status, to)) {
    throw new HttpError(409, 'INVALID_TRANSITION', `A ${locked.status} bed cannot become ${to}`);
  }
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { fullName: true } });
  await tx.bedStatusChange.create({
    data: {
      hospitalId,
      bedId,
      assignmentId,
      fromStatus: locked.status,
      toStatus: to,
      reason,
      changedById: actorId,
      changedByName: actor?.fullName ?? '—',
    },
  });
  return tx.bed.update({ where: { id: bedId }, data: { status: to, statusChangedAt: new Date() } });
}

/** A bed's history, newest first, with the patient of each stay. */
export async function bedHistory(
  db: ScopedPrisma,
  bedId: string,
  take = 50,
): Promise<BedStatusChangeView[]> {
  const bed = await db.bed.findUnique({ where: { id: bedId }, select: { id: true } });
  if (!bed) throw new HttpError(404, 'NOT_FOUND', 'Bed not found');
  const changes = await db.bedStatusChange.findMany({
    where: { bedId },
    orderBy: { createdAt: 'desc' },
    take,
    include: { assignment: { select: { patient: { select: { fullName: true } } } } },
  });
  return changes.map((change) => ({
    id: change.id,
    fromStatus: change.fromStatus,
    toStatus: change.toStatus,
    reason: change.reason,
    changedByName: change.changedByName,
    createdAt: change.createdAt.toISOString(),
    patientName: change.assignment?.patient.fullName ?? null,
  }));
}
