-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('DOCTOR_CALL', 'OPERATION_POSTPONED', 'OPERATION_ENDED', 'CLEANING_REQUEST', 'BED_DISCHARGED', 'LAB_RESULT', 'IMAGING_RESULT', 'CONSULTATION_REQUEST', 'CONSULTATION_REPLY', 'LOW_STOCK', 'LEAVE_REQUEST', 'PURCHASE_REQUEST', 'REQUEST_DECIDED', 'MEETING_REQUEST', 'COMPLAINT', 'MEDICATION_REMINDER', 'FOLLOW_UP_REMINDER', 'APPOINTMENT_CANCELLED');

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_hospitalId_idx" ON "Notification"("hospitalId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
