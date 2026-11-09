-- CreateEnum
CREATE TYPE "ReportKind" AS ENUM ('PHARMACY');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'REPORT_SUBMITTED';

-- CreateTable
CREATE TABLE "Report" (
    "id" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "kind" "ReportKind" NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "data" JSONB NOT NULL,
    "notes" TEXT,
    "authorId" UUID,
    "authorName" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Report_hospitalId_kind_createdAt_idx" ON "Report"("hospitalId", "kind", "createdAt");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
