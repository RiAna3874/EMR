-- AlterTable
ALTER TABLE "Encounter" ADD COLUMN     "advice" TEXT,
ADD COLUMN     "followUpDate" DATE,
ADD COLUMN     "followUpInterval" TEXT,
ADD COLUMN     "followUpNote" TEXT;

-- CreateTable
CREATE TABLE "EncounterDiagnosis" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "code" TEXT,
    "display" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "conditionId" TEXT,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncounterDiagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EncounterDiagnosis_encounterId_rank_idx" ON "EncounterDiagnosis"("encounterId", "rank");

-- CreateIndex
CREATE INDEX "EncounterDiagnosis_patientId_idx" ON "EncounterDiagnosis"("patientId");

-- CreateIndex
CREATE INDEX "EncounterDiagnosis_conditionId_idx" ON "EncounterDiagnosis"("conditionId");

-- AddForeignKey
ALTER TABLE "EncounterDiagnosis" ADD CONSTRAINT "EncounterDiagnosis_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterDiagnosis" ADD CONSTRAINT "EncounterDiagnosis_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterDiagnosis" ADD CONSTRAINT "EncounterDiagnosis_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "Condition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterDiagnosis" ADD CONSTRAINT "EncounterDiagnosis_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

