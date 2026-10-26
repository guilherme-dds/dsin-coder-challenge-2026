-- CreateTable
CREATE TABLE "Occurrence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "regionId" TEXT,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    "agentsDispatched" INTEGER NOT NULL DEFAULT 1,
    "equipmentId" TEXT,
    "note" TEXT,
    CONSTRAINT "Occurrence_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Occurrence_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TelemetryDaily" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "equipmentId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "metric" TEXT NOT NULL,
    "avg" REAL NOT NULL,
    "min" REAL NOT NULL,
    "max" REAL NOT NULL,
    "samples" INTEGER NOT NULL,
    CONSTRAINT "TelemetryDaily_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Occurrence_occurredAt_idx" ON "Occurrence"("occurredAt");

-- CreateIndex
CREATE INDEX "Occurrence_regionId_occurredAt_idx" ON "Occurrence"("regionId", "occurredAt");

-- CreateIndex
CREATE INDEX "TelemetryDaily_date_idx" ON "TelemetryDaily"("date");

-- CreateIndex
CREATE UNIQUE INDEX "TelemetryDaily_equipmentId_date_metric_key" ON "TelemetryDaily"("equipmentId", "date", "metric");

