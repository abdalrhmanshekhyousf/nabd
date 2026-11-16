import { DEFAULT_PRICES, type DepartmentCode, type ServiceKind } from '@nabd/shared';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';

// Every service a patient gets is added to their account (task 4.12), at the
// price of the hospital's price list: the price for that exact service (a lab
// test's code, an imaging modality, a drug's stock item) or else the kind's
// default, or else the built-in default. Each charge has a source (the test,
// the study, the stay…), so doing a step twice never charges twice.

type Charge = {
  hospitalId: string;
  patientId: string;
  kind: ServiceKind;
  code?: string;
  description: string;
  quantity?: number;
  sourceId: string;
  /** The department that gave it (4.18). */
  departmentId?: string | null;
};

/** A built-in department of the hospital, by its code. */
async function departmentByCode(db: ScopedPrisma, code: DepartmentCode) {
  const found = await db.department.findFirst({ where: { code }, select: { id: true } });
  return found?.id ?? null;
}

/** The price of a service: exact code, the kind's default, then the built-in one. */
export async function priceOf(db: ScopedPrisma, kind: ServiceKind, code = '') {
  const rows = await db.servicePrice.findMany({
    where: { kind, code: { in: code ? [code, ''] : [''] } },
    select: { code: true, price: true },
  });
  const exact = rows.find((row) => row.code === code && code) ?? rows.find((row) => !row.code);
  return exact ? Number(exact.price) : DEFAULT_PRICES[kind];
}

/** Adds a charge once per source; returns whether it was new. */
export async function addCharge(db: ScopedPrisma, charge: Charge) {
  const quantity = Math.max(1, charge.quantity ?? 1);
  const unitPrice = await priceOf(db, charge.kind, charge.code);
  const { count } = await db.invoiceItem.createMany({
    data: [
      {
        hospitalId: charge.hospitalId,
        patientId: charge.patientId,
        kind: charge.kind,
        description: charge.description,
        quantity,
        unitPrice,
        total: unitPrice * quantity,
        sourceId: charge.sourceId,
        departmentId: charge.departmentId ?? null,
      },
    ],
    skipDuplicates: true,
  });
  return count > 0;
}

/** A charge not invoiced yet goes away with what it was for (a cancelled visit). */
export async function dropCharge(db: ScopedPrisma, kind: ServiceKind, sourceId: string) {
  await db.invoiceItem.deleteMany({ where: { kind, sourceId, invoiceId: null } });
}

/** A booked clinic visit (3.20, 4.2). */
export async function chargeAppointment(db: ScopedPrisma, hospitalId: string, id: string) {
  const visit = await db.appointment.findUnique({
    where: { id },
    select: {
      patientId: true,
      doctorName: true,
      doctor: { select: { staffProfile: { select: { departmentId: true } } } },
    },
  });
  if (!visit) return;
  await addCharge(db, {
    hospitalId,
    patientId: visit.patientId,
    kind: 'VISIT',
    description: visit.doctorName,
    sourceId: id,
    departmentId: visit.doctor?.staffProfile?.departmentId ?? null,
  });
}

/** An emergency visit (2.11, 4.3). */
export async function chargeErVisit(db: ScopedPrisma, hospitalId: string, id: string) {
  const visit = await db.triageAssessment.findUnique({
    where: { id },
    select: { patientId: true },
  });
  if (!visit) return;
  await addCharge(db, {
    hospitalId,
    patientId: visit.patientId,
    kind: 'VISIT',
    code: 'EMERGENCY',
    description: 'EMERGENCY',
    sourceId: id,
    departmentId: await departmentByCode(db, 'EMERGENCY'),
  });
}

/** A lab test with its result (3.6), priced by its code. */
export async function chargeLabTest(db: ScopedPrisma, hospitalId: string, id: string) {
  const test = await db.labTest.findUnique({
    where: { id },
    select: { code: true, status: true, record: { select: { patientId: true } } },
  });
  if (!test || test.status !== 'DONE') return;
  await addCharge(db, {
    hospitalId,
    patientId: test.record.patientId,
    kind: 'LAB_TEST',
    code: test.code,
    description: test.code,
    sourceId: id,
    departmentId: await departmentByCode(db, 'LABORATORY'),
  });
}

/** An imaging study once reported (3.8), priced by its modality. */
export async function chargeImaging(db: ScopedPrisma, hospitalId: string, id: string) {
  const study = await db.radiologyImage.findUnique({
    where: { id },
    select: {
      modality: true,
      bodyPart: true,
      status: true,
      record: { select: { patientId: true } },
    },
  });
  if (!study || study.status !== 'DONE') return;
  await addCharge(db, {
    hospitalId,
    patientId: study.record.patientId,
    kind: 'IMAGING',
    code: study.modality,
    description: `${study.modality} · ${study.bodyPart}`,
    sourceId: id,
    departmentId: await departmentByCode(db, 'RADIOLOGY'),
  });
}

/** The medicines handed over for a prescription (3.10), priced per stock item. */
export async function chargePrescription(db: ScopedPrisma, hospitalId: string, id: string) {
  const prescription = await db.prescription.findUnique({
    where: { id },
    select: {
      record: { select: { patientId: true } },
      items: { select: { id: true, dispensedQuantity: true, dispensedName: true } },
    },
  });
  if (!prescription) return;
  const pharmacy = await departmentByCode(db, 'PHARMACY');
  for (const item of prescription.items) {
    if (!item.dispensedQuantity) continue;
    const movement = await db.stockMovement.findFirst({
      where: { prescriptionItemId: item.id },
      select: { itemId: true },
    });
    await addCharge(db, {
      hospitalId,
      patientId: prescription.record.patientId,
      kind: 'DRUG',
      code: movement?.itemId ?? '',
      description: item.dispensedName ?? '',
      quantity: item.dispensedQuantity,
      sourceId: item.id,
      departmentId: pharmacy,
    });
  }
}

/** A ward stay once discharged (3.16): every started day counts. */
export async function chargeStay(db: ScopedPrisma, hospitalId: string, id: string) {
  const stay = await db.bedAssignment.findUnique({
    where: { id },
    select: {
      patientId: true,
      admittedAt: true,
      dischargedAt: true,
      bed: { select: { room: { select: { departmentId: true } } } },
    },
  });
  if (!stay?.dischargedAt) return;
  const days = Math.max(
    1,
    Math.ceil((stay.dischargedAt.getTime() - stay.admittedAt.getTime()) / 86_400_000),
  );
  await addCharge(db, {
    hospitalId,
    patientId: stay.patientId,
    kind: 'BED_DAY',
    description: 'BED_DAY',
    quantity: days,
    sourceId: id,
    departmentId: stay.bed.room.departmentId,
  });
}

/** The operations finished in a room (2.22): charged once each. */
export async function chargeOperations(db: ScopedPrisma, hospitalId: string, roomId: string) {
  const done = await db.operationBooking.findMany({
    where: {
      operatingRoomId: roomId,
      status: 'COMPLETED',
      endedAt: { gte: new Date(Date.now() - 86_400_000) },
    },
    select: { id: true, patientId: true, procedure: true },
  });
  const operations = await departmentByCode(db, 'OPERATIONS');
  for (const booking of done) {
    await addCharge(db, {
      hospitalId,
      patientId: booking.patientId,
      kind: 'OPERATION',
      description: booking.procedure,
      sourceId: booking.id,
      departmentId: operations,
    });
  }
}
