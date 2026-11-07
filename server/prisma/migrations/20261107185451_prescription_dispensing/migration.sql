-- AlterTable
ALTER TABLE "Prescription" ADD COLUMN     "dispensedById" UUID,
ADD COLUMN     "dispensedByName" TEXT;

-- AlterTable
ALTER TABLE "PrescriptionItem" ADD COLUMN     "dispensedName" TEXT,
ADD COLUMN     "dispensedQuantity" INTEGER,
ADD COLUMN     "dispensedUnit" TEXT;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_dispensedById_fkey" FOREIGN KEY ("dispensedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
