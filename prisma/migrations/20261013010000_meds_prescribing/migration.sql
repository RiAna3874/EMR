-- CreateEnum
CREATE TYPE "RxClass" AS ENUM ('e_prescribe', 'print', 'phone', 'historical');

-- CreateEnum
CREATE TYPE "PatientTaking" AS ENUM ('taking', 'not_taking', 'taking_differently');

-- CreateEnum
CREATE TYPE "RefillStatus" AS ENUM ('requested', 'pended', 'approved', 'denied');

-- AlterEnum
ALTER TYPE "MedStatus" ADD VALUE 'replaced';

-- AlterTable
ALTER TABLE "MedicationRequest" ADD COLUMN     "authoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "cosignedAt" TIMESTAMP(3),
ADD COLUMN     "cosignerId" TEXT,
ADD COLUMN     "daw" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "daysSupply" INTEGER,
ADD COLUMN     "endReason" TEXT,
ADD COLUMN     "endedById" TEXT,
ADD COLUMN     "patientInstructions" TEXT,
ADD COLUMN     "pharmacyId" TEXT,
ADD COLUMN     "pharmacyNote" TEXT,
ADD COLUMN     "priorId" TEXT,
ADD COLUMN     "prn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "prnReason" TEXT,
ADD COLUMN     "quantity" TEXT,
ADD COLUMN     "refills" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rxClass" "RxClass" NOT NULL DEFAULT 'e_prescribe',
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "taking" "PatientTaking",
ADD COLUMN     "takingAt" TIMESTAMP(3),
ADD COLUMN     "takingNote" TEXT;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "medsReviewedAt" TIMESTAMP(3),
ADD COLUMN     "medsReviewedById" TEXT,
ADD COLUMN     "preferredPharmacyId" TEXT;

-- CreateTable
CREATE TABLE "Pharmacy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "fax" TEXT,
    "mailOrder" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Pharmacy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationDispense" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "pharmacyId" TEXT,
    "filledAt" TIMESTAMP(3) NOT NULL,
    "quantity" TEXT NOT NULL,
    "daysSupply" INTEGER NOT NULL,

    CONSTRAINT "MedicationDispense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefillRequest" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "pharmacyId" TEXT,
    "status" "RefillStatus" NOT NULL DEFAULT 'requested',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pharmacyComment" TEXT,
    "pendedById" TEXT,
    "pendedAt" TIMESTAMP(3),
    "pendNote" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "resultId" TEXT,

    CONSTRAINT "RefillRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MedicationDispense_medicationId_filledAt_idx" ON "MedicationDispense"("medicationId", "filledAt");

-- CreateIndex
CREATE INDEX "RefillRequest_status_idx" ON "RefillRequest"("status");

-- CreateIndex
CREATE INDEX "RefillRequest_patientId_idx" ON "RefillRequest"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "MedicationRequest_priorId_key" ON "MedicationRequest"("priorId");

-- CreateIndex
CREATE INDEX "MedicationRequest_cosignerId_cosignedAt_idx" ON "MedicationRequest"("cosignerId", "cosignedAt");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_preferredPharmacyId_fkey" FOREIGN KEY ("preferredPharmacyId") REFERENCES "Pharmacy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_medsReviewedById_fkey" FOREIGN KEY ("medsReviewedById") REFERENCES "Practitioner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationRequest" ADD CONSTRAINT "MedicationRequest_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "Pharmacy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationRequest" ADD CONSTRAINT "MedicationRequest_priorId_fkey" FOREIGN KEY ("priorId") REFERENCES "MedicationRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationRequest" ADD CONSTRAINT "MedicationRequest_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "Practitioner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationRequest" ADD CONSTRAINT "MedicationRequest_cosignerId_fkey" FOREIGN KEY ("cosignerId") REFERENCES "Practitioner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationDispense" ADD CONSTRAINT "MedicationDispense_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationDispense" ADD CONSTRAINT "MedicationDispense_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "MedicationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationDispense" ADD CONSTRAINT "MedicationDispense_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "Pharmacy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefillRequest" ADD CONSTRAINT "RefillRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefillRequest" ADD CONSTRAINT "RefillRequest_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "MedicationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefillRequest" ADD CONSTRAINT "RefillRequest_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "Pharmacy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefillRequest" ADD CONSTRAINT "RefillRequest_pendedById_fkey" FOREIGN KEY ("pendedById") REFERENCES "Practitioner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefillRequest" ADD CONSTRAINT "RefillRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "Practitioner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefillRequest" ADD CONSTRAINT "RefillRequest_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "MedicationRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

