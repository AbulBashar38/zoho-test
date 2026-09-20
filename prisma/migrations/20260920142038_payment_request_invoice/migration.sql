-- AlterTable
ALTER TABLE "payment_requests" ADD COLUMN     "zohoInvoiceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payment_requests_zohoInvoiceId_key" ON "payment_requests"("zohoInvoiceId");

