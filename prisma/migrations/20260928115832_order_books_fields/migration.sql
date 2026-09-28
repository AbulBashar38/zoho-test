-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "paymentMode" TEXT,
ADD COLUMN     "paymentReference" TEXT,
ADD COLUMN     "zohoService" TEXT DEFAULT 'BILLING';

