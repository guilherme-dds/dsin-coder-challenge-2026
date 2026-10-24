-- CreateTable
CREATE TABLE "TelemetryReading" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "equipmentId" TEXT NOT NULL,
    "metrics" TEXT NOT NULL DEFAULT '{}',
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelemetryReading_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentPosition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentPosition_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "District" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    CONSTRAINT "District_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "title" TEXT NOT NULL,
    "message" TEXT,
    "dedupKey" TEXT NOT NULL,
    "equipmentId" TEXT,
    "agentId" TEXT,
    "regionId" TEXT,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" DATETIME,
    "acknowledgedBy" TEXT,
    "resolvedAt" DATETIME,
    CONSTRAINT "Alert_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Alert_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Alert_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AvailabilitySnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "takenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "regionId" TEXT,
    "total" INTEGER NOT NULL,
    "installed" INTEGER NOT NULL,
    "operational" INTEGER NOT NULL,
    "unavailable" INTEGER NOT NULL,
    "activeAgents" INTEGER NOT NULL,
    "openAlerts" INTEGER NOT NULL,
    CONSTRAINT "AvailabilitySnapshot_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "registration" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "rank" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "shift" TEXT,
    "baseName" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "latitude" REAL,
    "longitude" REAL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "fieldStatus" TEXT NOT NULL DEFAULT 'DISPONIVEL',
    "lastPositionAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Agent" ("active", "baseName", "city", "createdAt", "district", "email", "id", "latitude", "longitude", "name", "phone", "rank", "registration", "role", "shift", "state", "updatedAt") SELECT "active", "baseName", "city", "createdAt", "district", "email", "id", "latitude", "longitude", "name", "phone", "rank", "registration", "role", "shift", "state", "updatedAt" FROM "Agent";
DROP TABLE "Agent";
ALTER TABLE "new_Agent" RENAME TO "Agent";
CREATE UNIQUE INDEX "Agent_registration_key" ON "Agent"("registration");
CREATE TABLE "new_Equipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serialNumber" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NAO_INSTALADO',
    "agency" TEXT NOT NULL DEFAULT 'TRANSITO',
    "zipCode" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "maintenanceType" TEXT NOT NULL DEFAULT 'NENHUMA',
    "nextMaintenanceAt" DATETIME,
    "maintenanceIntervalDays" INTEGER,
    "attributes" TEXT NOT NULL DEFAULT '{}',
    "lastSeenAt" DATETIME,
    "responsibleAgentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Equipment_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "EquipmentType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Equipment_responsibleAgentId_fkey" FOREIGN KEY ("responsibleAgentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Equipment" ("attributes", "brand", "city", "createdAt", "district", "id", "latitude", "longitude", "maintenanceIntervalDays", "maintenanceType", "model", "nextMaintenanceAt", "reference", "responsibleAgentId", "serialNumber", "state", "status", "street", "typeId", "updatedAt", "zipCode") SELECT "attributes", "brand", "city", "createdAt", "district", "id", "latitude", "longitude", "maintenanceIntervalDays", "maintenanceType", "model", "nextMaintenanceAt", "reference", "responsibleAgentId", "serialNumber", "state", "status", "street", "typeId", "updatedAt", "zipCode" FROM "Equipment";
DROP TABLE "Equipment";
ALTER TABLE "new_Equipment" RENAME TO "Equipment";
CREATE UNIQUE INDEX "Equipment_serialNumber_key" ON "Equipment"("serialNumber");
CREATE INDEX "Equipment_status_idx" ON "Equipment"("status");
CREATE INDEX "Equipment_district_idx" ON "Equipment"("district");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TelemetryReading_equipmentId_receivedAt_idx" ON "TelemetryReading"("equipmentId", "receivedAt");

-- CreateIndex
CREATE INDEX "AgentPosition_agentId_recordedAt_idx" ON "AgentPosition"("agentId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Region_code_key" ON "Region"("code");

-- CreateIndex
CREATE UNIQUE INDEX "District_name_key" ON "District"("name");

-- CreateIndex
CREATE INDEX "Alert_status_severity_idx" ON "Alert"("status", "severity");

-- CreateIndex
CREATE INDEX "Alert_dedupKey_status_idx" ON "Alert"("dedupKey", "status");

-- CreateIndex
CREATE INDEX "AvailabilitySnapshot_regionId_takenAt_idx" ON "AvailabilitySnapshot"("regionId", "takenAt");
