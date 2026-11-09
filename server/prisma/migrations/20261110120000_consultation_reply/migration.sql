-- AlterTable
ALTER TABLE "DoctorReport" ADD COLUMN     "consultationId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "DoctorReport_consultationId_key" ON "DoctorReport"("consultationId");

-- AddForeignKey
ALTER TABLE "DoctorReport" ADD CONSTRAINT "DoctorReport_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

