-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'EXPIRED');

-- DropForeignKey
ALTER TABLE "payment_requests" DROP CONSTRAINT "payment_requests_userId_fkey";

-- DropTable
DROP TABLE "payment_requests";

-- DropEnum
DROP TYPE "PaymentRequestStatus";

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "description" TEXT,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currencyCode" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "zohoCustomerId" TEXT NOT NULL,
    "zohoPaymentLinkId" TEXT,
    "paymentLinkNumber" TEXT,
    "paymentUrl" TEXT,
    "zohoPaymentId" TEXT,
    "zohoInvoiceId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "orders_zohoPaymentLinkId_key" ON "orders"("zohoPaymentLinkId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_zohoInvoiceId_key" ON "orders"("zohoInvoiceId");

-- CreateIndex
CREATE INDEX "idx_order_userId" ON "orders"("userId");

-- CreateIndex
CREATE INDEX "idx_order_status" ON "orders"("status");

-- CreateIndex
CREATE INDEX "idx_order_customer" ON "orders"("zohoCustomerId");

-- CreateIndex
CREATE INDEX "idx_order_item_orderId" ON "order_items"("orderId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

