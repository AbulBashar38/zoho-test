-- CreateTable
CREATE TABLE "sign_agreements" (
    "id" TEXT NOT NULL,
    "zohoRequestId" TEXT NOT NULL,
    "requestName" TEXT,
    "templateId" TEXT,
    "status" TEXT NOT NULL,
    "reference" TEXT,
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sign_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sign_agreement_recipients" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "zohoActionId" TEXT NOT NULL,
    "role" TEXT,
    "name" TEXT,
    "email" TEXT,
    "status" TEXT,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sign_agreement_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sign_agreement_fields" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "zohoFieldId" TEXT NOT NULL,
    "fieldName" TEXT,
    "fieldLabel" TEXT,
    "value" TEXT NOT NULL,
    "filledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sign_agreement_fields_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sign_agreements_zohoRequestId_key" ON "sign_agreements"("zohoRequestId");

-- CreateIndex
CREATE INDEX "idx_sign_agreement_status" ON "sign_agreements"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sign_agreement_recipients_agreementId_zohoActionId_key" ON "sign_agreement_recipients"("agreementId", "zohoActionId");

-- CreateIndex
CREATE INDEX "idx_sign_field_name" ON "sign_agreement_fields"("fieldName");

-- CreateIndex
CREATE UNIQUE INDEX "sign_agreement_fields_agreementId_zohoFieldId_key" ON "sign_agreement_fields"("agreementId", "zohoFieldId");

-- AddForeignKey
ALTER TABLE "sign_agreements" ADD CONSTRAINT "sign_agreements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sign_agreement_recipients" ADD CONSTRAINT "sign_agreement_recipients_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "sign_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sign_agreement_fields" ADD CONSTRAINT "sign_agreement_fields_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "sign_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

