-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('male', 'female', 'other', 'unknown');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('physician', 'nurse', 'front_desk');

-- CreateEnum
CREATE TYPE "AllergyReviewStatus" AS ENUM ('not_reviewed', 'no_known_allergies', 'has_allergies');

-- CreateEnum
CREATE TYPE "EncounterType" AS ENUM ('office', 'telehealth', 'phone');

-- CreateEnum
CREATE TYPE "EncounterStatus" AS ENUM ('planned', 'arrived', 'in_progress', 'finished', 'cancelled');

-- CreateEnum
CREATE TYPE "ConditionStatus" AS ENUM ('active', 'resolved');

-- CreateEnum
CREATE TYPE "AllergySeverity" AS ENUM ('mild', 'moderate', 'severe');

-- CreateEnum
CREATE TYPE "AllergyType" AS ENUM ('drug', 'food', 'environment', 'other');

-- CreateEnum
CREATE TYPE "MedStatus" AS ENUM ('active', 'on_hold', 'discontinued', 'completed');

-- CreateEnum
CREATE TYPE "ObservationCategory" AS ENUM ('vital_signs', 'laboratory');

-- CreateEnum
CREATE TYPE "Flag" AS ENUM ('N', 'L', 'H', 'LL', 'HH', 'A');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('preliminary', 'final');

-- CreateEnum
CREATE TYPE "ReportSource" AS ENUM ('ordered', 'imported');

-- CreateEnum
CREATE TYPE "NoteType" AS ENUM ('progress', 'history_physical', 'consult', 'phone');

-- CreateEnum
CREATE TYPE "NoteStatus" AS ENUM ('draft', 'signed', 'addended');

-- CreateTable
CREATE TABLE "Practitioner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "credentials" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Practitioner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "mrn" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dob" DATE NOT NULL,
    "sex" "Sex" NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'English',
    "codeStatus" TEXT NOT NULL DEFAULT 'Full code',
    "allergyStatus" "AllergyReviewStatus" NOT NULL DEFAULT 'not_reviewed',
    "pcpId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Encounter" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "type" "EncounterType" NOT NULL,
    "status" "EncounterStatus" NOT NULL,
    "reason" TEXT,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3),
    "providerId" TEXT,

    CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Condition" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "display" TEXT NOT NULL,
    "status" "ConditionStatus" NOT NULL,
    "onset" DATE,
    "resolvedAt" DATE,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "comment" TEXT,

    CONSTRAINT "Condition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllergyIntolerance" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "substance" TEXT NOT NULL,
    "type" "AllergyType" NOT NULL,
    "reaction" TEXT,
    "severity" "AllergySeverity" NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllergyIntolerance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationRequest" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "drug" TEXT NOT NULL,
    "rxnorm" TEXT,
    "dose" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "indication" TEXT,
    "status" "MedStatus" NOT NULL,
    "start" DATE NOT NULL,
    "end" DATE,
    "prescriberId" TEXT,

    CONSTRAINT "MedicationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Observation" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "reportId" TEXT,
    "category" "ObservationCategory" NOT NULL,
    "code" TEXT NOT NULL,
    "display" TEXT NOT NULL,
    "valueNum" DOUBLE PRECISION,
    "valueText" TEXT,
    "unit" TEXT,
    "refLow" DOUBLE PRECISION,
    "refHigh" DOUBLE PRECISION,
    "refText" TEXT,
    "flag" "Flag",
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticReport" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "display" TEXT NOT NULL,
    "performer" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "status" "ReportStatus" NOT NULL,
    "source" "ReportSource" NOT NULL DEFAULT 'ordered',
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "DiagnosticReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "type" "NoteType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "NoteStatus" NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedAt" TIMESTAMP(3),

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Patient_mrn_key" ON "Patient"("mrn");

-- CreateIndex
CREATE INDEX "Patient_lastName_firstName_idx" ON "Patient"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Encounter_patientId_start_idx" ON "Encounter"("patientId", "start");

-- CreateIndex
CREATE INDEX "Encounter_start_idx" ON "Encounter"("start");

-- CreateIndex
CREATE INDEX "Condition_patientId_idx" ON "Condition"("patientId");

-- CreateIndex
CREATE INDEX "AllergyIntolerance_patientId_idx" ON "AllergyIntolerance"("patientId");

-- CreateIndex
CREATE INDEX "MedicationRequest_patientId_idx" ON "MedicationRequest"("patientId");

-- CreateIndex
CREATE INDEX "Observation_patientId_category_effectiveAt_idx" ON "Observation"("patientId", "category", "effectiveAt");

-- CreateIndex
CREATE INDEX "DiagnosticReport_patientId_effectiveAt_idx" ON "DiagnosticReport"("patientId", "effectiveAt");

-- CreateIndex
CREATE INDEX "Note_patientId_createdAt_idx" ON "Note"("patientId", "createdAt");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_pcpId_fkey" FOREIGN KEY ("pcpId") REFERENCES "Practitioner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Practitioner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Condition" ADD CONSTRAINT "Condition_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllergyIntolerance" ADD CONSTRAINT "AllergyIntolerance_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationRequest" ADD CONSTRAINT "MedicationRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationRequest" ADD CONSTRAINT "MedicationRequest_prescriberId_fkey" FOREIGN KEY ("prescriberId") REFERENCES "Practitioner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DiagnosticReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticReport" ADD CONSTRAINT "DiagnosticReport_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
