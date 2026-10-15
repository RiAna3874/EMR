-- Taper and "followed by" sigs: the dose steps of one prescription.
ALTER TABLE "MedicationRequest" ADD COLUMN "steps" JSONB;
