-- CreateEnum
CREATE TYPE "Consciousness" AS ENUM ('ALERT', 'VERBAL', 'PAIN', 'UNRESPONSIVE');

-- CreateEnum
CREATE TYPE "TriageStatus" AS ENUM ('WAITING', 'IN_TREATMENT', 'TRANSFERRED', 'DISCHARGED');

-- CreateEnum
CREATE TYPE "DoctorCallStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

-- CreateTable
CREATE TABLE "TriageAssessment" (
    "id" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "nurseId" UUID,
    "status" "TriageStatus" NOT NULL DEFAULT 'WAITING',
    "arrivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chiefComplaint" TEXT,
    "pulse" INTEGER,
    "systolic" INTEGER,
    "diastolic" INTEGER,
    "respiratoryRate" INTEGER,
    "oxygenSaturation" INTEGER,
    "temperature" DECIMAL(4,1),
    "consciousness" "Consciousness",
    "breathing" BOOLEAN,
    "painScore" INTEGER,
    "expectedExams" INTEGER,
    "suggestedLevel" INTEGER,
    "level" INTEGER,
    "overrideReason" TEXT,
    "assessedAt" TIMESTAMP(3),
    "departmentId" UUID,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TriageAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorCall" (
    "id" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "triageId" UUID NOT NULL,
    "doctorId" UUID,
    "calledById" UUID,
    "status" "DoctorCallStatus" NOT NULL DEFAULT 'PENDING',
    "declineReason" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TriageAssessment_hospitalId_status_level_arrivedAt_idx" ON "TriageAssessment"("hospitalId", "status", "level", "arrivedAt");

-- CreateIndex
CREATE INDEX "TriageAssessment_patientId_idx" ON "TriageAssessment"("patientId");

-- CreateIndex
CREATE INDEX "DoctorCall_doctorId_status_idx" ON "DoctorCall"("doctorId", "status");

-- CreateIndex
CREATE INDEX "DoctorCall_triageId_idx" ON "DoctorCall"("triageId");

-- AddForeignKey
ALTER TABLE "TriageAssessment" ADD CONSTRAINT "TriageAssessment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriageAssessment" ADD CONSTRAINT "TriageAssessment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriageAssessment" ADD CONSTRAINT "TriageAssessment_nurseId_fkey" FOREIGN KEY ("nurseId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriageAssessment" ADD CONSTRAINT "TriageAssessment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorCall" ADD CONSTRAINT "DoctorCall_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorCall" ADD CONSTRAINT "DoctorCall_triageId_fkey" FOREIGN KEY ("triageId") REFERENCES "TriageAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorCall" ADD CONSTRAINT "DoctorCall_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorCall" ADD CONSTRAINT "DoctorCall_calledById_fkey" FOREIGN KEY ("calledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Values that can't be real are refused by the database too (task 2.10).
ALTER TABLE "TriageAssessment"
  ADD CONSTRAINT "TriageAssessment_level_range" CHECK ("level" BETWEEN 1 AND 5),
  ADD CONSTRAINT "TriageAssessment_suggestedLevel_range" CHECK ("suggestedLevel" BETWEEN 1 AND 5),
  ADD CONSTRAINT "TriageAssessment_painScore_range" CHECK ("painScore" BETWEEN 0 AND 10),
  ADD CONSTRAINT "TriageAssessment_pulse_range" CHECK ("pulse" BETWEEN 0 AND 300),
  ADD CONSTRAINT "TriageAssessment_systolic_range" CHECK ("systolic" BETWEEN 0 AND 300),
  ADD CONSTRAINT "TriageAssessment_diastolic_range" CHECK ("diastolic" BETWEEN 0 AND 200),
  ADD CONSTRAINT "TriageAssessment_respiratoryRate_range" CHECK ("respiratoryRate" BETWEEN 0 AND 80),
  ADD CONSTRAINT "TriageAssessment_oxygenSaturation_range" CHECK ("oxygenSaturation" BETWEEN 0 AND 100),
  ADD CONSTRAINT "TriageAssessment_temperature_range" CHECK ("temperature" BETWEEN 25 AND 45),
  ADD CONSTRAINT "TriageAssessment_expectedExams_range" CHECK ("expectedExams" BETWEEN 0 AND 20);
