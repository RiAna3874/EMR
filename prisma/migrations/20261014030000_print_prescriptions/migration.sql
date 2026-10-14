-- No prescription was ever sent electronically or phoned in: the clinic has no pharmacy link.
-- Prescriptions recorded as "E-prescribed" or "Phoned in" become printed ones, so the
-- medication list offers "Print Rx" for them and stops saying they were sent.
UPDATE "MedicationRequest" SET "rxClass" = 'print', "sentAt" = NULL, "pharmacyId" = NULL
WHERE "rxClass" IN ('e_prescribe', 'phone');

-- The prescriber's registration number (BMDC in Bangladesh), printed on prescriptions.
ALTER TABLE "Practitioner" ADD COLUMN "registrationNumber" TEXT;
