-- CreateEnum
CREATE TYPE "BookingKind" AS ENUM ('SCHEDULED', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('SCHEDULED', 'POSTPONED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CleaningKind" AS ENUM ('CLEANING', 'STERILIZATION');

-- CreateEnum
CREATE TYPE "CleaningStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "OperationBooking" (
    "id" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "operatingRoomId" UUID,
    "patientId" UUID NOT NULL,
    "triageId" UUID,
    "surgeonId" UUID,
    "surgeonName" TEXT NOT NULL,
    "bookedById" UUID,
    "kind" "BookingKind" NOT NULL DEFAULT 'SCHEDULED',
    "status" "BookingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "procedure" TEXT NOT NULL,
    "notes" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatingRoomStatusChange" (
    "id" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "operatingRoomId" UUID NOT NULL,
    "bookingId" UUID,
    "fromStatus" "OperatingRoomStatus" NOT NULL,
    "toStatus" "OperatingRoomStatus" NOT NULL,
    "changedById" UUID,
    "changedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatingRoomStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleaningRequest" (
    "id" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "kind" "CleaningKind" NOT NULL DEFAULT 'CLEANING',
    "status" "CleaningStatus" NOT NULL DEFAULT 'PENDING',
    "operatingRoomId" UUID,
    "bedId" UUID,
    "place" TEXT,
    "note" TEXT,
    "requestedById" UUID,
    "assignedToId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "CleaningRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperationBooking_operatingRoomId_startsAt_idx" ON "OperationBooking"("operatingRoomId", "startsAt");

-- CreateIndex
CREATE INDEX "OperationBooking_hospitalId_status_startsAt_idx" ON "OperationBooking"("hospitalId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "OperatingRoomStatusChange_operatingRoomId_createdAt_idx" ON "OperatingRoomStatusChange"("operatingRoomId", "createdAt");

-- CreateIndex
CREATE INDEX "CleaningRequest_hospitalId_departmentId_status_idx" ON "CleaningRequest"("hospitalId", "departmentId", "status");

-- AddForeignKey
ALTER TABLE "OperationBooking" ADD CONSTRAINT "OperationBooking_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationBooking" ADD CONSTRAINT "OperationBooking_operatingRoomId_fkey" FOREIGN KEY ("operatingRoomId") REFERENCES "OperatingRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationBooking" ADD CONSTRAINT "OperationBooking_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationBooking" ADD CONSTRAINT "OperationBooking_triageId_fkey" FOREIGN KEY ("triageId") REFERENCES "TriageAssessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationBooking" ADD CONSTRAINT "OperationBooking_surgeonId_fkey" FOREIGN KEY ("surgeonId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationBooking" ADD CONSTRAINT "OperationBooking_bookedById_fkey" FOREIGN KEY ("bookedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatingRoomStatusChange" ADD CONSTRAINT "OperatingRoomStatusChange_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatingRoomStatusChange" ADD CONSTRAINT "OperatingRoomStatusChange_operatingRoomId_fkey" FOREIGN KEY ("operatingRoomId") REFERENCES "OperatingRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatingRoomStatusChange" ADD CONSTRAINT "OperatingRoomStatusChange_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "OperationBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatingRoomStatusChange" ADD CONSTRAINT "OperatingRoomStatusChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningRequest" ADD CONSTRAINT "CleaningRequest_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningRequest" ADD CONSTRAINT "CleaningRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningRequest" ADD CONSTRAINT "CleaningRequest_operatingRoomId_fkey" FOREIGN KEY ("operatingRoomId") REFERENCES "OperatingRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningRequest" ADD CONSTRAINT "CleaningRequest_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningRequest" ADD CONSTRAINT "CleaningRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningRequest" ADD CONSTRAINT "CleaningRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
