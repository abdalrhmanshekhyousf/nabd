-- CreateTable
CREATE TABLE "CleanerAssignment" (
    "id" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CleanerAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CleanerAssignment_hospitalId_departmentId_idx" ON "CleanerAssignment"("hospitalId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CleanerAssignment_userId_departmentId_key" ON "CleanerAssignment"("userId", "departmentId");

-- AddForeignKey
ALTER TABLE "CleanerAssignment" ADD CONSTRAINT "CleanerAssignment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleanerAssignment" ADD CONSTRAINT "CleanerAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleanerAssignment" ADD CONSTRAINT "CleanerAssignment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
