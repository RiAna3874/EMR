-- Start and end dates on orders and prescriptions.
ALTER TABLE "ServiceRequest" ADD COLUMN "expiresAt" DATE;
ALTER TABLE "MedicationRequest" ADD COLUMN "courseStart" DATE;
