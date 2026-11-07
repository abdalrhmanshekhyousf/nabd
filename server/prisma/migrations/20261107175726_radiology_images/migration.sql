-- CreateEnum
CREATE TYPE "ImagingStatus" AS ENUM ('REQUESTED', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "RadiologyImage" (
    "id" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "modality" "RadiologyModality" NOT NULL,
    "bodyPart" TEXT NOT NULL,
    "reason" TEXT,
    "priority" "LabPriority" NOT NULL DEFAULT 'ROUTINE',
    "status" "ImagingStatus" NOT NULL DEFAULT 'REQUESTED',
    "doctorId" UUID,
    "doctorName" TEXT NOT NULL,
    "radiologistId" UUID,
    "radiologistName" TEXT,
    "report" TEXT,
    "imageFiles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "abnormal" BOOLEAN,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadiologyImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RadiologyImage_hospitalId_modality_status_priority_createdA_idx" ON "RadiologyImage"("hospitalId", "modality", "status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "RadiologyImage_recordId_createdAt_idx" ON "RadiologyImage"("recordId", "createdAt");

-- AddForeignKey
ALTER TABLE "RadiologyImage" ADD CONSTRAINT "RadiologyImage_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiologyImage" ADD CONSTRAINT "RadiologyImage_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "MedicalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiologyImage" ADD CONSTRAINT "RadiologyImage_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiologyImage" ADD CONSTRAINT "RadiologyImage_radiologistId_fkey" FOREIGN KEY ("radiologistId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
