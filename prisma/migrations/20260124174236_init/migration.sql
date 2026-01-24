-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "fileUrl" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rowsParsed" INTEGER NOT NULL DEFAULT 0,
    "warningsCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechJournalShift" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shiftNumber" INTEGER NOT NULL,
    "sourceUploadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechJournalShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechProductivity" (
    "id" TEXT NOT NULL,
    "techShiftId" TEXT NOT NULL,
    "hour" INTEGER NOT NULL,
    "millLine" INTEGER NOT NULL,
    "valuePct" DOUBLE PRECISION,

    CONSTRAINT "TechProductivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechDowntime" (
    "id" TEXT NOT NULL,
    "techShiftId" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,
    "timeFrom" TEXT,
    "timeTo" TEXT,
    "minutes" DOUBLE PRECISION,
    "reasonText" TEXT,

    CONSTRAINT "TechDowntime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaterDaily" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "meterReading" DOUBLE PRECISION,
    "actualDaily" DOUBLE PRECISION,
    "actualHourly" DOUBLE PRECISION,
    "nominalDaily" DOUBLE PRECISION,
    "monthLabel" TEXT,
    "sourceUploadId" TEXT,

    CONSTRAINT "WaterDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DowntimeDaily" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "equipment" TEXT NOT NULL,
    "reasonText" TEXT,
    "minutes" DOUBLE PRECISION,
    "classification" TEXT,
    "sourceUploadId" TEXT,

    CONSTRAINT "DowntimeDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hazard" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceRefId" TEXT,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "tags" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hazard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TechJournalShift_date_shiftNumber_key" ON "TechJournalShift"("date", "shiftNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WaterDaily_date_key" ON "WaterDaily"("date");

-- CreateIndex
CREATE INDEX "DowntimeDaily_date_idx" ON "DowntimeDaily"("date");

-- AddForeignKey
ALTER TABLE "TechProductivity" ADD CONSTRAINT "TechProductivity_techShiftId_fkey" FOREIGN KEY ("techShiftId") REFERENCES "TechJournalShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechDowntime" ADD CONSTRAINT "TechDowntime_techShiftId_fkey" FOREIGN KEY ("techShiftId") REFERENCES "TechJournalShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

