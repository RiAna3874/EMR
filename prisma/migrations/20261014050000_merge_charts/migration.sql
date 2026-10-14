-- Merging a duplicate chart into the patient's real one.
ALTER TABLE "Patient" ADD COLUMN "mergedIntoId" TEXT, ADD COLUMN "mergedAt" TIMESTAMP(3), ADD COLUMN "mergedById" TEXT;
