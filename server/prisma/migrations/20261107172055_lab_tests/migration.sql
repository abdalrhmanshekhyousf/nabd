-- CreateEnum
CREATE TYPE "LabTestStatus" AS ENUM ('REQUESTED', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LabPriority" AS ENUM ('ROUTINE', 'URGENT');

-- CreateTable
CREATE TABLE "LabTest" (
    "id" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "priority" "LabPriority" NOT NULL DEFAULT 'ROUTINE',
    "notes" TEXT,
    "status" "LabTestStatus" NOT NULL DEFAULT 'REQUESTED',
    "doctorId" UUID,
    "doctorName" TEXT NOT NULL,
    "technicianId" UUID,
    "technicianName" TEXT,
    "result" TEXT,
    "resultFile" TEXT,
    "abnormal" BOOLEAN,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LabTest_hospitalId_status_priority_createdAt_idx" ON "LabTest"("hospitalId", "status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "LabTest_recordId_createdAt_idx" ON "LabTest"("recordId", "createdAt");

-- AddForeignKey
ALTER TABLE "LabTest" ADD CONSTRAINT "LabTest_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTest" ADD CONSTRAINT "LabTest_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "MedicalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTest" ADD CONSTRAINT "LabTest_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTest" ADD CONSTRAINT "LabTest_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
