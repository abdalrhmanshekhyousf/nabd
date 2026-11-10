-- CreateTable
CREATE TABLE "DoctorVacation" (
    "id" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "doctorId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "reason" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorVacation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DoctorVacation_doctorId_endDate_idx" ON "DoctorVacation"("doctorId", "endDate");

-- AddForeignKey
ALTER TABLE "DoctorVacation" ADD CONSTRAINT "DoctorVacation_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorVacation" ADD CONSTRAINT "DoctorVacation_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorVacation" ADD CONSTRAINT "DoctorVacation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A vacation ends on or after its first day (task 3.21).
ALTER TABLE "DoctorVacation" ADD CONSTRAINT "DoctorVacation_dates_check" CHECK ("startDate" <= "endDate");
