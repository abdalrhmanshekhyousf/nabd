import type { PatientFile, PatientSummary, PrescriptionView, DoctorReportView } from '@nabd/shared';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';

const day = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

const patientFields = {
  id: true,
  fullName: true,
  isAnonymous: true,
  gender: true,
  dateOfBirth: true,
  phone: true,
} as const;

/**
 * The doctor's own patients (task 2.7): those whose file names them as the
 * treating doctor, most recently changed first, optionally searched by name.
 */
export async function listMyPatients(
  db: ScopedPrisma,
  doctorId: string,
  search?: string,
): Promise<PatientSummary[]> {
  const records = await db.medicalRecord.findMany({
    where: {
      doctorId,
      ...(search && { patient: { fullName: { contains: search, mode: 'insensitive' } } }),
    },
    select: {
      patient: { select: patientFields },
      _count: { select: { reports: true, prescriptions: true } },
      reports: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { updatedAt: 'desc' },
  });
  return records.map(({ patient, _count, reports }) => ({
    patientId: patient.id,
    fullName: patient.fullName,
    isAnonymous: patient.isAnonymous,
    gender: patient.gender,
    dateOfBirth: day(patient.dateOfBirth),
    phone: patient.phone,
    reportCount: _count.reports,
    prescriptionCount: _count.prescriptions,
    lastReportAt: reports[0]?.createdAt.toISOString() ?? null,
  }));
}

/**
 * One patient's whole file, read-only, for their treating doctor. Anyone
 * else's patient is "not found", so the list of patients doesn't leak.
 */
export async function getPatientFile(
  db: ScopedPrisma,
  doctorId: string,
  patientId: string,
): Promise<PatientFile> {
  const record = await db.medicalRecord.findFirst({
    where: { patientId, doctorId },
    include: {
      patient: { select: { ...patientFields, bloodType: true, nationalId: true, address: true } },
      doctor: { select: { fullName: true } },
      reports: { orderBy: { createdAt: 'desc' } },
      prescriptions: { orderBy: { createdAt: 'desc' }, include: { items: true } },
    },
  });
  if (!record) throw new HttpError(404, 'NOT_FOUND', 'Patient not found');

  const { patient } = record;
  return {
    patient: {
      patientId: patient.id,
      fullName: patient.fullName,
      isAnonymous: patient.isAnonymous,
      gender: patient.gender,
      dateOfBirth: day(patient.dateOfBirth),
      phone: patient.phone,
      bloodType: patient.bloodType,
      nationalId: patient.nationalId,
      address: patient.address,
    },
    record: {
      id: record.id,
      doctorName: record.doctor?.fullName ?? null,
      allergies: record.allergies,
      chronicConditions: record.chronicConditions,
      notes: record.notes,
    },
    reports: record.reports.map((report): DoctorReportView => ({
      id: report.id,
      doctorName: report.doctorName,
      title: report.title,
      diagnosis: report.diagnosis,
      content: report.content,
      createdAt: report.createdAt.toISOString(),
    })),
    prescriptions: record.prescriptions.map((prescription): PrescriptionView => ({
      id: prescription.id,
      doctorName: prescription.doctorName,
      status: prescription.status,
      notes: prescription.notes,
      createdAt: prescription.createdAt.toISOString(),
      dispensedAt: prescription.dispensedAt?.toISOString() ?? null,
      items: prescription.items.map(
        ({ id, drugName, dose, frequency, durationDays, instructions }) => ({
          id,
          drugName,
          dose,
          frequency,
          durationDays,
          instructions,
        }),
      ),
    })),
  };
}
