-- Link medications and orders to the problem they treat, for problem-based notes.
-- AlterTable
ALTER TABLE "MedicationRequest" ADD COLUMN     "conditionId" TEXT;

-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "conditionId" TEXT;

-- CreateIndex
CREATE INDEX "MedicationRequest_conditionId_idx" ON "MedicationRequest"("conditionId");

-- CreateIndex
CREATE INDEX "ServiceRequest_conditionId_idx" ON "ServiceRequest"("conditionId");

-- AddForeignKey
ALTER TABLE "MedicationRequest" ADD CONSTRAINT "MedicationRequest_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "Condition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "Condition"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Existing medications and orders whose indication names one of the patient's
-- problems are linked to it (an active problem first).
UPDATE "MedicationRequest" m SET "conditionId" = (
  SELECT c."id" FROM "Condition" c
  WHERE c."patientId" = m."patientId" AND lower(trim(c."display")) = lower(trim(m."indication"))
  ORDER BY (c."status" = 'active') DESC, c."priority" LIMIT 1
) WHERE m."indication" IS NOT NULL;

UPDATE "ServiceRequest" s SET "conditionId" = (
  SELECT c."id" FROM "Condition" c
  WHERE c."patientId" = s."patientId" AND lower(trim(c."display")) = lower(trim(s."indication"))
  ORDER BY (c."status" = 'active') DESC, c."priority" LIMIT 1
) WHERE s."indication" IS NOT NULL;
