
-- CreateIndex
CREATE INDEX "Appointment_hospitalId_startsAt_idx" ON "Appointment"("hospitalId", "startsAt");

-- CreateIndex
CREATE INDEX "BedStatusChange_hospitalId_idx" ON "BedStatusChange"("hospitalId");

-- CreateIndex
CREATE INDEX "DoctorCall_hospitalId_idx" ON "DoctorCall"("hospitalId");

-- CreateIndex
CREATE INDEX "DoctorVacation_hospitalId_idx" ON "DoctorVacation"("hospitalId");

-- CreateIndex
CREATE INDEX "InvoiceItem_hospitalId_invoiceId_idx" ON "InvoiceItem"("hospitalId", "invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceItem_hospitalId_createdAt_idx" ON "InvoiceItem"("hospitalId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "OperatingRoomStatusChange_hospitalId_idx" ON "OperatingRoomStatusChange"("hospitalId");

-- CreateIndex
CREATE INDEX "PrescriptionItem_hospitalId_idx" ON "PrescriptionItem"("hospitalId");

-- CreateIndex
CREATE INDEX "PurchaseItem_hospitalId_idx" ON "PurchaseItem"("hospitalId");

-- CreateIndex
CREATE INDEX "PushSubscription_hospitalId_idx" ON "PushSubscription"("hospitalId");

-- CreateIndex
CREATE INDEX "StockMovement_prescriptionItemId_idx" ON "StockMovement"("prescriptionItemId");

