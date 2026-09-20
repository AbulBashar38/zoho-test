-- CreateEnum
CREATE TYPE "PaymentRequestStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "payment_requests" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currencyCode" TEXT,
    "status" "PaymentRequestStatus" NOT NULL DEFAULT 'PENDING',
    "zohoCustomerId" TEXT NOT NULL,
    "zohoPaymentLinkId" TEXT,
    "paymentLinkNumber" TEXT,
    "paymentUrl" TEXT,
    "zohoPaymentId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_requests_reference_key" ON "payment_requests"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "payment_requests_zohoPaymentLinkId_key" ON "payment_requests"("zohoPaymentLinkId");

-- CreateIndex
CREATE INDEX "idx_payment_request_userId" ON "payment_requests"("userId");

-- CreateIndex
CREATE INDEX "idx_payment_request_status" ON "payment_requests"("status");

-- CreateIndex
CREATE INDEX "idx_payment_request_customer" ON "payment_requests"("zohoCustomerId");

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

