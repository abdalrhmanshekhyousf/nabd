import type {
  CreatePrescriptionData,
  CreateReportData,
  DoctorReportView,
  PatientFile,
  PatientSummary,
  PrescriptionView,
} from '@nabd/shared';
import type { ScopedPrisma } from '../lib/scopedPrisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { consultationInclude, toConsultationView } from './consultation.service.js';
import { toImagingView } from './imaging.service.js';
import { toPrescriptionView } from './pharmacy.service.js';
import { toLabView } from './lab.service.js';

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
export function getPatientFile(
  db: ScopedPrisma,
  doctorId: string,
  patientId: string,
): Promise<PatientFile> {
  return loadFile(db, { patientId, doctorId });
}

/** The whole file of the record that matches, or "not found". */
export async function loadFile(
  db: ScopedPrisma,
  where: { patientId: string; doctorId: string } | { id: string },
): Promise<PatientFile> {
  const record = await db.medicalRecord.findFirst({
    where,
    include: {
      patient: { select: { ...patientFields, bloodType: true, nationalId: true, address: true } },
      doctor: { select: { fullName: true } },
      reports: { orderBy: { createdAt: 'desc' } },
      prescriptions: { orderBy: { createdAt: 'desc' }, include: { items: true } },
      labTests: { orderBy: { createdAt: 'desc' } },
      imaging: { orderBy: { createdAt: 'desc' } },
      consultations: { orderBy: { createdAt: 'desc' }, include: consultationInclude },
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
    labTests: record.labTests.map(toLabView),
    imaging: record.imaging.map(toImagingView),
    reports: record.reports.map((report): DoctorReportView => ({
      id: report.id,
      doctorName: report.doctorName,
      title: report.title,
      diagnosis: report.diagnosis,
      content: report.content,
      createdAt: report.createdAt.toISOString(),
    })),
    prescriptions: record.prescriptions.map(toPrescriptionView),
    consultations: record.consultations.map(toConsultationView),
  };
}

/** The file of one of my patients, or "not found" (same rule as reading it). */
async function requireMyRecord(db: ScopedPrisma, doctorId: string, patientId: string) {
  const [record, doctor] = await Promise.all([
    db.medicalRecord.findFirst({ where: { patientId, doctorId }, select: { id: true } }),
    db.user.findUnique({ where: { id: doctorId }, select: { fullName: true } }),
  ]);
  if (!record || !doctor) throw new HttpError(404, 'NOT_FOUND', 'Patient not found');
  return { recordId: record.id, doctorName: doctor.fullName };
}

/** Moves the patient to the top of "my patients". */
const touch = (db: ScopedPrisma, recordId: string) =>
  db.medicalRecord.update({ where: { id: recordId }, data: { updatedAt: new Date() } });

/** Writes a medical report in my patient's file (task 2.8), signed with my name. */
export async function addReport(
  db: ScopedPrisma,
  hospitalId: string,
  doctorId: string,
  patientId: string,
  input: CreateReportData,
): Promise<DoctorReportView> {
  const { recordId, doctorName } = await requireMyRecord(db, doctorId, patientId);
  const report = await db.doctorReport.create({
    data: { hospitalId, recordId, doctorId, doctorName, ...input },
  });
  await touch(db, recordId);
  return {
    id: report.id,
    doctorName: report.doctorName,
    title: report.title,
    diagnosis: report.diagnosis,
    content: report.content,
    createdAt: report.createdAt.toISOString(),
  };
}

/** Writes a prescription for my patient; it waits for the pharmacist (3.10). */
export async function addPrescription(
  db: ScopedPrisma,
  hospitalId: string,
  doctorId: string,
  patientId: string,
  { items, notes }: CreatePrescriptionData,
): Promise<PrescriptionView> {
  const { recordId, doctorName } = await requireMyRecord(db, doctorId, patientId);
  const prescription = await db.prescription.create({
    data: {
      hospitalId,
      recordId,
      doctorId,
      doctorName,
      notes,
      // Nested rows are not stamped by the scoped client: hospitalId explicitly.
      items: { create: items.map((item) => ({ hospitalId, ...item })) },
    },
    include: { items: true },
  });
  await touch(db, recordId);
  return toPrescriptionView(prescription);
}
