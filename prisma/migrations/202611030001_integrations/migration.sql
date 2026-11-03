CREATE TABLE "IntegrationConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mikrotikBaseUrl" TEXT,
    "mikrotikUsername" TEXT,
    "mikrotikPasswordEnc" TEXT,
    "smartoltBaseUrl" TEXT,
    "smartoltApiTokenEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntegrationConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationConfig_tenantId_key" ON "IntegrationConfig"("tenantId");

ALTER TABLE "IntegrationConfig"
ADD CONSTRAINT "IntegrationConfig_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
