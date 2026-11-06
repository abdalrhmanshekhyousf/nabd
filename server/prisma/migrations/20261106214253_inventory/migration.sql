-- CreateEnum
CREATE TYPE "InventoryCategory" AS ENUM ('DRUG', 'LAB', 'RADIOLOGY');

-- CreateEnum
CREATE TYPE "StockMovementKind" AS ENUM ('RESTOCK', 'DISPENSE', 'USE', 'ADJUST');

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "category" "InventoryCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "minQuantity" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "kind" "StockMovementKind" NOT NULL,
    "change" INTEGER NOT NULL,
    "quantityAfter" INTEGER NOT NULL,
    "reason" TEXT,
    "byId" UUID,
    "byName" TEXT NOT NULL,
    "prescriptionItemId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryItem_hospitalId_category_idx" ON "InventoryItem"("hospitalId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_hospitalId_category_name_key" ON "InventoryItem"("hospitalId", "category", "name");

-- CreateIndex
CREATE INDEX "StockMovement_itemId_createdAt_idx" ON "StockMovement"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_hospitalId_createdAt_idx" ON "StockMovement"("hospitalId", "createdAt");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_byId_fkey" FOREIGN KEY ("byId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_prescriptionItemId_fkey" FOREIGN KEY ("prescriptionItemId") REFERENCES "PrescriptionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Stock never goes below zero, and a movement always changes something (task 3.1).
ALTER TABLE "InventoryItem"
  ADD CONSTRAINT "InventoryItem_quantity_not_negative" CHECK ("quantity" >= 0),
  ADD CONSTRAINT "InventoryItem_minQuantity_not_negative" CHECK ("minQuantity" >= 0);
ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_change_not_zero" CHECK ("change" <> 0),
  ADD CONSTRAINT "StockMovement_quantityAfter_not_negative" CHECK ("quantityAfter" >= 0);
