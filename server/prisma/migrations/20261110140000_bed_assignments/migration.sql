-- CreateTable
CREATE TABLE "BedAssignment" (
    "id" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "bedId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "visitId" UUID,
    "notes" TEXT,
    "admittedById" UUID,
    "admittedByName" TEXT NOT NULL,
    "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dischargedAt" TIMESTAMP(3),
    "dischargedById" UUID,
    "dischargedByName" TEXT,

    CONSTRAINT "BedAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BedStatusChange" (
    "id" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "bedId" UUID NOT NULL,
    "assignmentId" UUID,
    "fromStatus" "BedStatus" NOT NULL,
    "toStatus" "BedStatus" NOT NULL,
    "reason" TEXT,
    "changedById" UUID,
    "changedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BedStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BedAssignment_bedId_admittedAt_idx" ON "BedAssignment"("bedId", "admittedAt");

-- CreateIndex
CREATE INDEX "BedAssignment_hospitalId_patientId_idx" ON "BedAssignment"("hospitalId", "patientId");

-- CreateIndex
CREATE INDEX "BedStatusChange_bedId_createdAt_idx" ON "BedStatusChange"("bedId", "createdAt");

-- AddForeignKey
ALTER TABLE "BedAssignment" ADD CONSTRAINT "BedAssignment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedAssignment" ADD CONSTRAINT "BedAssignment_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedAssignment" ADD CONSTRAINT "BedAssignment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedAssignment" ADD CONSTRAINT "BedAssignment_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "TriageAssessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedAssignment" ADD CONSTRAINT "BedAssignment_admittedById_fkey" FOREIGN KEY ("admittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedAssignment" ADD CONSTRAINT "BedAssignment_dischargedById_fkey" FOREIGN KEY ("dischargedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedStatusChange" ADD CONSTRAINT "BedStatusChange_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedStatusChange" ADD CONSTRAINT "BedStatusChange_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedStatusChange" ADD CONSTRAINT "BedStatusChange_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "BedAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedStatusChange" ADD CONSTRAINT "BedStatusChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- One open stay per bed and per patient (task 3.15).
CREATE UNIQUE INDEX "BedAssignment_open_bed_key" ON "BedAssignment"("bedId") WHERE "dischargedAt" IS NULL;
CREATE UNIQUE INDEX "BedAssignment_open_patient_key" ON "BedAssignment"("patientId") WHERE "dischargedAt" IS NULL;
