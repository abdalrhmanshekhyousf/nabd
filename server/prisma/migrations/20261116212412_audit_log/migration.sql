
-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('VIEW', 'EDIT');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "userId" UUID,
    "userName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "action" "AuditAction" NOT NULL,
    "patientId" UUID,
    "patientName" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_hospitalId_createdAt_idx" ON "AuditLog"("hospitalId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_patientId_idx" ON "AuditLog"("patientId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

