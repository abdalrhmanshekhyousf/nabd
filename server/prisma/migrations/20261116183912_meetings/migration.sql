-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'DECLINED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Meeting" (
    "id" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "calledById" UUID,
    "doctorId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "topic" TEXT NOT NULL,
    "status" "MeetingStatus" NOT NULL DEFAULT 'REQUESTED',
    "response" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Meeting_hospitalId_startsAt_idx" ON "Meeting"("hospitalId", "startsAt");

-- CreateIndex
CREATE INDEX "Meeting_doctorId_idx" ON "Meeting"("doctorId");

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_calledById_fkey" FOREIGN KEY ("calledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

