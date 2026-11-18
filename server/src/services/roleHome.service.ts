import { zonedDate, zonedInstant, type HomeTile, type Role } from '@nabd/shared';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { patientOfUser } from './appointment.service.js';
import { monthlyProfit, monthOf } from './profit.service.js';

/** The start of today and of tomorrow, in hospital time. */
function today() {
  const date = zonedDate(new Date());
  const start = zonedInstant(date, 0);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

const lowStock = async (db: ScopedPrisma, category: 'DRUG' | 'LAB' | 'RADIOLOGY') => {
  const items = await db.inventoryItem.findMany({
    where: { category },
    select: { quantity: true, minQuantity: true },
  });
  return items.filter((item) => item.quantity <= item.minQuantity).length;
};

async function departmentOf(db: ScopedPrisma, userId: string) {
  const profile = await db.staffProfile.findUnique({
    where: { userId },
    select: { radiologyModality: true, department: { select: { id: true, code: true } } },
  });
  return { department: profile?.department ?? null, modality: profile?.radiologyModality ?? null };
}

/**
 * Each role's home (user request after 4.24): today's numbers for the work of
 * that role, each a way into its page. The admin's home is its own (4.20).
 */
export async function roleHome(db: ScopedPrisma, userId: string, role: Role): Promise<HomeTile[]> {
  const day = today();
  switch (role) {
    case 'DOCTOR': {
      const [patients, calls, consultations, visits] = await Promise.all([
        db.medicalRecord.count({ where: { doctorId: userId } }),
        db.doctorCall.count({ where: { doctorId: userId, status: 'PENDING' } }),
        db.consultation.count({ where: { consultantId: userId, status: 'PENDING' } }),
        db.appointment.count({
          where: { doctorId: userId, status: 'BOOKED', startsAt: { gte: day.start, lt: day.end } },
        }),
      ]);
      return [
        { key: 'calls', value: calls, to: '/doctor/calls', alert: calls > 0 },
        { key: 'visitsToday', value: visits, to: '/doctor/schedule' },
        { key: 'myPatients', value: patients, to: '/doctor/patients' },
        {
          key: 'consultationsAsked',
          value: consultations,
          to: '/doctor/consultations',
          alert: consultations > 0,
        },
      ];
    }
    case 'NURSE': {
      const { department } = await departmentOf(db, userId);
      if (department?.code === 'EMERGENCY') {
        const [waiting, urgent, inTreatment] = await Promise.all([
          db.triageAssessment.count({ where: { status: 'WAITING' } }),
          db.triageAssessment.count({
            where: { status: { in: ['WAITING', 'IN_TREATMENT'] }, level: { lte: 2 } },
          }),
          db.triageAssessment.count({ where: { status: 'IN_TREATMENT' } }),
        ]);
        return [
          { key: 'erWaiting', value: waiting, to: '/nurse/emergency', alert: waiting > 0 },
          { key: 'erUrgent', value: urgent, to: '/nurse/emergency', alert: urgent > 0 },
          { key: 'erInTreatment', value: inTreatment, to: '/nurse/emergency' },
          { key: 'newCase', value: null, to: '/nurse/new-case' },
        ];
      }
      const where = department ? { room: { departmentId: department.id } } : { id: '' };
      const [occupied, empty, cleaning, requests] = await Promise.all([
        db.bed.count({ where: { ...where, status: 'OCCUPIED' } }),
        db.bed.count({ where: { ...where, status: 'EMPTY' } }),
        db.bed.count({ where: { ...where, status: 'CLEANING' } }),
        db.cleaningRequest.count({
          where: { departmentId: department?.id ?? '', status: { in: ['PENDING', 'IN_PROGRESS'] } },
        }),
      ]);
      return [
        { key: 'bedsOccupied', value: occupied, to: '/nurse/beds' },
        { key: 'bedsEmpty', value: empty, to: '/nurse/beds' },
        { key: 'bedsCleaning', value: cleaning, to: '/nurse/beds' },
        { key: 'cleaningOpen', value: requests, to: '/nurse/cleaning' },
      ];
    }
    case 'PHARMACIST': {
      const [pending, dispensed, low] = await Promise.all([
        db.prescription.count({ where: { status: 'PENDING' } }),
        db.prescription.count({
          where: { status: 'DISPENSED', dispensedAt: { gte: day.start, lt: day.end } },
        }),
        lowStock(db, 'DRUG'),
      ]);
      return [
        {
          key: 'prescriptionsWaiting',
          value: pending,
          to: '/pharmacy/prescriptions',
          alert: pending > 0,
        },
        { key: 'dispensedToday', value: dispensed, to: '/pharmacy/prescriptions' },
        { key: 'lowStock', value: low, to: '/pharmacy/inventory', alert: low > 0 },
      ];
    }
    case 'LAB_TECHNICIAN': {
      const [waiting, urgent, running, done, low] = await Promise.all([
        db.labTest.count({ where: { status: 'REQUESTED' } }),
        db.labTest.count({
          where: { status: { in: ['REQUESTED', 'IN_PROGRESS'] }, priority: 'URGENT' },
        }),
        db.labTest.count({ where: { status: 'IN_PROGRESS' } }),
        db.labTest.count({
          where: { status: 'DONE', completedAt: { gte: day.start, lt: day.end } },
        }),
        lowStock(db, 'LAB'),
      ]);
      return [
        { key: 'testsWaiting', value: waiting, to: '/lab/requests', alert: waiting > 0 },
        { key: 'urgent', value: urgent, to: '/lab/requests', alert: urgent > 0 },
        { key: 'inProgress', value: running, to: '/lab/requests' },
        { key: 'doneToday', value: done, to: '/lab/requests' },
        { key: 'lowStock', value: low, to: '/lab/inventory', alert: low > 0 },
      ];
    }
    case 'RADIOLOGIST': {
      const { modality } = await departmentOf(db, userId);
      const mine = modality ? { modality } : {};
      const [waiting, urgent, done, low] = await Promise.all([
        db.radiologyImage.count({ where: { ...mine, status: 'REQUESTED' } }),
        db.radiologyImage.count({
          where: { ...mine, status: { in: ['REQUESTED', 'IN_PROGRESS'] }, priority: 'URGENT' },
        }),
        db.radiologyImage.count({
          where: { ...mine, status: 'DONE', completedAt: { gte: day.start, lt: day.end } },
        }),
        lowStock(db, 'RADIOLOGY'),
      ]);
      return [
        { key: 'studiesWaiting', value: waiting, to: '/radiology/requests', alert: waiting > 0 },
        { key: 'urgent', value: urgent, to: '/radiology/requests', alert: urgent > 0 },
        { key: 'doneToday', value: done, to: '/radiology/requests' },
        { key: 'lowStock', value: low, to: '/radiology/inventory', alert: low > 0 },
      ];
    }
    case 'CLEANER': {
      const assigned = await db.cleanerAssignment.findMany({
        where: { userId },
        select: { departmentId: true },
      });
      const departments = { departmentId: { in: assigned.map((a) => a.departmentId) } };
      const [waiting, sterilization, mine, done] = await Promise.all([
        db.cleaningRequest.count({
          where: { ...departments, status: 'PENDING', kind: 'CLEANING' },
        }),
        db.cleaningRequest.count({
          where: { ...departments, status: 'PENDING', kind: 'STERILIZATION' },
        }),
        db.cleaningRequest.count({ where: { assignedToId: userId, status: 'IN_PROGRESS' } }),
        db.cleaningRequest.count({
          where: {
            assignedToId: userId,
            status: 'DONE',
            finishedAt: { gte: day.start, lt: day.end },
          },
        }),
      ]);
      return [
        { key: 'cleaningWaiting', value: waiting, to: '/cleaning/tasks', alert: waiting > 0 },
        {
          key: 'sterilizationWaiting',
          value: sterilization,
          to: '/cleaning/tasks',
          alert: sterilization > 0,
        },
        { key: 'myInProgress', value: mine, to: '/cleaning/tasks' },
        { key: 'doneToday', value: done, to: '/cleaning/tasks' },
      ];
    }
    case 'RECEPTIONIST': {
      const [visits, unknown, registered] = await Promise.all([
        db.appointment.count({
          where: { status: 'BOOKED', startsAt: { gte: day.start, lt: day.end } },
        }),
        db.patient.count({ where: { isAnonymous: true } }),
        db.patient.count({ where: { createdAt: { gte: day.start, lt: day.end } } }),
      ]);
      return [
        { key: 'visitsToday', value: visits, to: '/reception/appointments' },
        { key: 'unidentified', value: unknown, to: '/reception/emergency', alert: unknown > 0 },
        { key: 'registeredToday', value: registered, to: '/reception/register' },
      ];
    }
    case 'ACCOUNTANT': {
      const [open, owed, [month]] = await Promise.all([
        db.invoiceItem.aggregate({ where: { invoiceId: null }, _sum: { total: true } }),
        db.invoice.findMany({
          where: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
          select: { total: true, paid: true },
        }),
        monthlyProfit(db, [monthOf(new Date())]),
      ]);
      return [
        {
          key: 'notInvoiced',
          value: Number(open._sum.total ?? 0),
          money: true,
          to: '/accounting/invoices',
        },
        {
          key: 'owed',
          value: owed.reduce((sum, row) => sum + Number(row.total) - Number(row.paid), 0),
          money: true,
          to: '/accounting/payments',
          hint: owed.length,
        },
        {
          key: 'receivedMonth',
          value: month!.revenue,
          money: true,
          to: '/accounting/monthly-report',
        },
      ];
    }
    case 'PATIENT': {
      const patientId = await patientOfUser(db, userId).catch(() => null);
      if (!patientId) return [];
      const [next, reminders, owed, results] = await Promise.all([
        db.appointment.findFirst({
          where: { patientId, status: 'BOOKED', startsAt: { gt: new Date() } },
          orderBy: { startsAt: 'asc' },
          select: { startsAt: true, doctorName: true },
        }),
        db.medicationReminder.count({ where: { patientId, active: true } }),
        db.invoice.findMany({
          where: { patientId, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
          select: { total: true, paid: true },
        }),
        db.labTest.count({ where: { status: 'DONE', record: { patientId } } }),
      ]);
      return [
        {
          key: 'nextVisit',
          value: null,
          at: next?.startsAt.toISOString() ?? null,
          detail: next?.doctorName ?? null,
          to: '/patient/appointments',
        },
        { key: 'reminders', value: reminders, to: '/patient/medications' },
        {
          key: 'due',
          value: owed.reduce((sum, row) => sum + Number(row.total) - Number(row.paid), 0),
          money: true,
          to: '/patient/invoices',
        },
        { key: 'results', value: results, to: '/patient/file' },
      ];
    }
    default:
      return [];
  }
}
