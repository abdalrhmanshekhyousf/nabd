import type {
  DispenseData,
  PharmacyPrescription,
  PrescriptionView,
  StockMatch,
} from '@nabd/shared';
import type { InventoryItem, Prescription, PrescriptionItem } from '../generated/prisma/client.js';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { emitRefresh, rooms } from '../realtime/realtime.js';
import { announceLowStock, moveStock } from './inventory.service.js';

/** A prescription as the file and the pharmacy show it, with what was handed over. */
export function toPrescriptionView(
  prescription: Prescription & { items: PrescriptionItem[] },
): PrescriptionView {
  return {
    id: prescription.id,
    doctorName: prescription.doctorName,
    status: prescription.status,
    notes: prescription.notes,
    createdAt: prescription.createdAt.toISOString(),
    dispensedAt: prescription.dispensedAt?.toISOString() ?? null,
    dispensedByName: prescription.dispensedByName,
    items: prescription.items.map((item) => ({
      id: item.id,
      drugName: item.drugName,
      dose: item.dose,
      frequency: item.frequency,
      durationDays: item.durationDays,
      instructions: item.instructions,
      dispensed:
        item.dispensedQuantity && item.dispensedName && item.dispensedUnit
          ? { quantity: item.dispensedQuantity, name: item.dispensedName, unit: item.dispensedUnit }
          : null,
    })),
  };
}

const normalize = (text: string) => text.trim().toLowerCase();

/**
 * The stock items that may fill a prescribed medicine (task 3.10): those whose
 * name holds the medicine's first word, the ones matching the dose's number
 * first, then those with more on the shelf.
 */
export function matchStock(
  drugName: string,
  dose: string,
  stock: Pick<InventoryItem, 'id' | 'name' | 'unit' | 'quantity'>[],
): StockMatch[] {
  const word = normalize(drugName).split(/\s+/)[0] ?? '';
  if (!word) return [];
  const number = dose.match(/\d+(?:[.,]\d+)?/)?.[0];
  return stock
    .filter((item) => normalize(item.name).includes(word))
    .map((item) => ({ item, dose: number && item.name.includes(number) ? 1 : 0 }))
    .sort((a, b) => b.dose - a.dose || b.item.quantity - a.item.quantity)
    .slice(0, 5)
    .map(({ item }) => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      quantity: item.quantity,
    }));
}

const boardInclude = {
  items: true,
  record: {
    select: {
      allergies: true,
      patient: {
        select: { id: true, fullName: true, isAnonymous: true, gender: true, dateOfBirth: true },
      },
    },
  },
} as const;

/**
 * The pharmacy's board (task 3.10): prescriptions waiting (oldest first) with
 * the patient's allergies and the stock that may fill each medicine, and those
 * dispensed in the last twelve hours.
 */
export async function pharmacyBoard(db: ScopedPrisma): Promise<PharmacyPrescription[]> {
  const [prescriptions, stock] = await Promise.all([
    db.prescription.findMany({
      where: {
        OR: [
          { status: 'PENDING' },
          { status: 'DISPENSED', dispensedAt: { gt: new Date(Date.now() - 12 * 3_600_000) } },
        ],
      },
      include: boardInclude,
      orderBy: { createdAt: 'asc' },
    }),
    db.inventoryItem.findMany({
      where: { category: 'DRUG' },
      select: { id: true, name: true, unit: true, quantity: true },
    }),
  ]);
  return prescriptions.map((prescription) => {
    const view = toPrescriptionView(prescription);
    const { patient, allergies } = prescription.record;
    return {
      ...view,
      patient: {
        ...patient,
        dateOfBirth: patient.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      },
      allergies,
      items: view.items.map((item) => ({
        ...item,
        matches:
          prescription.status === 'PENDING' ? matchStock(item.drugName, item.dose, stock) : [],
      })),
    };
  });
}

/**
 * Dispensing (task 3.10): each medicine is handed over from a stock item (the
 * quantity leaves the stock, logged against that prescription line) or marked
 * not available; the prescription is dispensed in the patient's file, signed.
 * All or nothing: if any item lacks stock, nothing is taken. Two pharmacists at
 * once: the second is told. Items that reach their minimum alert the others.
 */
export async function dispensePrescription(
  db: ScopedPrisma,
  hospitalId: string,
  pharmacistId: string,
  id: string,
  { lines }: DispenseData,
) {
  const pharmacist = await db.user.findUnique({
    where: { id: pharmacistId },
    select: { fullName: true },
  });
  const { prescription, lowItems } = await db.$transaction(async (tx) => {
    const current = await tx.prescription.findUnique({
      where: { id },
      include: {
        items: { select: { id: true } },
        record: { select: { patient: { select: { fullName: true } } } },
      },
    });
    if (!current) throw new HttpError(404, 'NOT_FOUND', 'Prescription not found');
    const { count } = await tx.prescription.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: 'DISPENSED',
        dispensedAt: new Date(),
        dispensedById: pharmacistId,
        dispensedByName: pharmacist?.fullName ?? '',
      },
    });
    if (count === 0) {
      throw new HttpError(
        409,
        current.status === 'DISPENSED' ? 'ALREADY_TAKEN' : 'INVALID_TRANSITION',
        `The prescription is ${current.status}`,
      );
    }
    // Every medicine of the prescription, once each.
    const ids = new Set(current.items.map((item) => item.id));
    const given = new Set(lines.map((line) => line.prescriptionItemId));
    if (
      given.size !== lines.length ||
      given.size !== ids.size ||
      [...given].some((x) => !ids.has(x))
    ) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Every medicine of the prescription, once each');
    }
    const lowItems: InventoryItem[] = [];
    for (const line of lines) {
      if (!line.inventoryItemId) continue;
      const stocked = await tx.inventoryItem.findFirst({
        where: { id: line.inventoryItemId, category: 'DRUG' },
        select: { id: true },
      });
      if (!stocked) throw new HttpError(404, 'NOT_FOUND', 'Stock item not found');
      const moved = await moveStock(tx, {
        hospitalId,
        itemId: line.inventoryItemId,
        change: -line.quantity,
        kind: 'DISPENSE',
        actorId: pharmacistId,
        reason: current.record.patient.fullName,
        prescriptionItemId: line.prescriptionItemId,
      });
      await tx.prescriptionItem.update({
        where: { id: line.prescriptionItemId },
        data: {
          dispensedQuantity: line.quantity,
          dispensedName: moved.item.name,
          dispensedUnit: moved.item.unit,
        },
      });
      if (moved.becameLow) lowItems.push(moved.item);
    }
    const done = await tx.prescription.findUniqueOrThrow({
      where: { id },
      include: { items: true },
    });
    return { prescription: done, lowItems };
  });

  for (const item of lowItems) await announceLowStock(db, hospitalId, pharmacistId, item);
  emitRefresh(rooms.role(hospitalId, 'PHARMACIST'), [['prescriptions']]);
  emitRefresh(rooms.hospital(hospitalId), [['inventory'], ['patient-file']]);
  return { prescription: toPrescriptionView(prescription), lowItems: lowItems.map((i) => i.name) };
}
