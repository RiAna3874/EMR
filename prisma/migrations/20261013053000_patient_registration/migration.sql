-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "duplicateCheckNote" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "emergencyContactRelation" TEXT,
ADD COLUMN     "insuranceGroup" TEXT,
ADD COLUMN     "middleName" TEXT,
ADD COLUMN     "preferredName" TEXT,
ADD COLUMN     "registeredById" TEXT,
ADD COLUMN     "subscriberName" TEXT,
ADD COLUMN     "subscriberRelation" TEXT;

-- CreateIndex
CREATE INDEX "Patient_dob_idx" ON "Patient"("dob");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "Practitioner"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- New MRNs come from a sequence, above the seeded range (M1004417 to M1085058).
CREATE SEQUENCE "patient_mrn_seq" START WITH 2000001;
