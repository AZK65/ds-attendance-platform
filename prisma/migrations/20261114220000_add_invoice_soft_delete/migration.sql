-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "deletedBy" TEXT;

-- CreateIndex
CREATE INDEX "Invoice_deletedAt_idx" ON "Invoice"("deletedAt");
