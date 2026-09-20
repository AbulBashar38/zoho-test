-- AlterTable
ALTER TABLE "users" ADD COLUMN     "zohoBillingCustomerId" TEXT;

-- CreateTable
CREATE TABLE "zoho_billing_subscriptions" (
    "id" TEXT NOT NULL,
    "zohoSubscriptionId" TEXT NOT NULL,
    "zohoCustomerId" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "planName" TEXT,
    "status" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currencyCode" TEXT,
    "referenceId" TEXT,
    "startsAt" TIMESTAMP(3),
    "nextBillingAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zoho_billing_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zoho_billing_invoices" (
    "id" TEXT NOT NULL,
    "zohoInvoiceId" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "zohoCustomerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL,
    "currencyCode" TEXT,
    "invoiceUrl" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "zohoSubscriptionId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zoho_billing_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zoho_billing_payments" (
    "id" TEXT NOT NULL,
    "zohoPaymentId" TEXT NOT NULL,
    "zohoInvoiceId" TEXT NOT NULL,
    "zohoCustomerId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentMode" TEXT,
    "referenceNumber" TEXT,
    "gatewayFee" DECIMAL(12,2),
    "netAmount" DECIMAL(12,2),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zoho_billing_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zoho_webhook_events" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventId" TEXT,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zoho_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "zoho_billing_subscriptions_zohoSubscriptionId_key" ON "zoho_billing_subscriptions"("zohoSubscriptionId");

-- CreateIndex
CREATE INDEX "idx_zoho_subscription_userId" ON "zoho_billing_subscriptions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "zoho_billing_invoices_zohoInvoiceId_key" ON "zoho_billing_invoices"("zohoInvoiceId");

-- CreateIndex
CREATE INDEX "idx_zoho_invoice_userId" ON "zoho_billing_invoices"("userId");

-- CreateIndex
CREATE INDEX "idx_zoho_invoice_status" ON "zoho_billing_invoices"("status");

-- CreateIndex
CREATE UNIQUE INDEX "zoho_billing_payments_zohoPaymentId_key" ON "zoho_billing_payments"("zohoPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "zoho_webhook_events_eventId_key" ON "zoho_webhook_events"("eventId");

-- CreateIndex
CREATE INDEX "idx_zoho_webhook_eventType" ON "zoho_webhook_events"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "users_zohoBillingCustomerId_key" ON "users"("zohoBillingCustomerId");

-- AddForeignKey
ALTER TABLE "zoho_billing_subscriptions" ADD CONSTRAINT "zoho_billing_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zoho_billing_invoices" ADD CONSTRAINT "zoho_billing_invoices_zohoSubscriptionId_fkey" FOREIGN KEY ("zohoSubscriptionId") REFERENCES "zoho_billing_subscriptions"("zohoSubscriptionId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zoho_billing_invoices" ADD CONSTRAINT "zoho_billing_invoices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zoho_billing_payments" ADD CONSTRAINT "zoho_billing_payments_zohoInvoiceId_fkey" FOREIGN KEY ("zohoInvoiceId") REFERENCES "zoho_billing_invoices"("zohoInvoiceId") ON DELETE CASCADE ON UPDATE CASCADE;

