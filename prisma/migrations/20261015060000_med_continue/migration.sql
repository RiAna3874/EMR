-- Medication reconciliation: "Continue" records who kept a medication going, and when.
ALTER TABLE "MedicationRequest" ADD COLUMN "continuedAt" TIMESTAMP(3),
ADD COLUMN "continuedById" TEXT;

ALTER TABLE "MedicationRequest" ADD CONSTRAINT "MedicationRequest_continuedById_fkey" FOREIGN KEY ("continuedById") REFERENCES "Practitioner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
