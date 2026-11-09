-- CreateEnum
CREATE TYPE "ConsultationStatus" AS ENUM ('PENDING', 'ANSWERED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Consultation" (
    "id" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "requesterId" UUID,
    "requesterName" TEXT NOT NULL,
    "consultantId" UUID,
    "consultantName" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "status" "ConsultationStatus" NOT NULL DEFAULT 'PENDING',
    "reply" TEXT,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Consultation_hospitalId_consultantId_status_idx" ON "Consultation"("hospitalId", "consultantId", "status");

-- CreateIndex
CREATE INDEX "Consultation_recordId_idx" ON "Consultation"("recordId");

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "MedicalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
