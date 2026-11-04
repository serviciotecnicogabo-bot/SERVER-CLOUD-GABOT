CREATE TABLE "PaymentNoticeConfig" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "businessName" TEXT,
  "logoDataUrl" TEXT,
  "qrDataUrl" TEXT,
  "message" TEXT NOT NULL DEFAULT 'Tu servicio está próximo a vencer. Realiza tu pago para evitar la suspensión.',
  "paymentInstructions" TEXT,
  "contactPhone" TEXT,
  "daysBeforeDue" INTEGER NOT NULL DEFAULT 3,
  "reconnectionFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'PEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentNoticeConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentNoticeConfig_tenantId_key" ON "PaymentNoticeConfig"("tenantId");
ALTER TABLE "PaymentNoticeConfig" ADD CONSTRAINT "PaymentNoticeConfig_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN "customerId" TEXT;
CREATE UNIQUE INDEX "User_customerId_key" ON "User"("customerId");
ALTER TABLE "User" ADD CONSTRAINT "User_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
