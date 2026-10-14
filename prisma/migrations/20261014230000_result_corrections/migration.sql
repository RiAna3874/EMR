-- Correcting a lab value that was typed or read wrong, keeping the earlier value.
ALTER TABLE "Observation" ADD COLUMN "correctedAt" TIMESTAMP(3);
ALTER TABLE "DiagnosticReport" ADD COLUMN "correctedAt" TIMESTAMP(3);

CREATE TABLE "ObservationCorrection" (
    "id" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "valueNum" DOUBLE PRECISION,
    "valueText" TEXT,
    "unit" TEXT,
    "refLow" DOUBLE PRECISION,
    "refHigh" DOUBLE PRECISION,
    "refText" TEXT,
    "flag" "Flag",
    "reason" TEXT NOT NULL,
    "correctedById" TEXT NOT NULL,
    "correctedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObservationCorrection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ObservationCorrection_observationId_correctedAt_idx" ON "ObservationCorrection"("observationId", "correctedAt");

ALTER TABLE "ObservationCorrection" ADD CONSTRAINT "ObservationCorrection_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "Observation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ObservationCorrection" ADD CONSTRAINT "ObservationCorrection_correctedById_fkey" FOREIGN KEY ("correctedById") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
