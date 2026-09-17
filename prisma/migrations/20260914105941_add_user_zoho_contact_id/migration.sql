-- AlterTable
ALTER TABLE "users" ADD COLUMN     "zohoContactId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_zohoContactId_key" ON "users"("zohoContactId");

