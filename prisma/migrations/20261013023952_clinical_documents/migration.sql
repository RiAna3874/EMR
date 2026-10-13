-- CreateEnum
CREATE TYPE "ImportKind" AS ENUM ('lab', 'document');

-- CreateEnum
CREATE TYPE "ClinicalDocType" AS ENUM ('imaging_report', 'discharge_summary', 'referral_letter', 'consult_note', 'procedure_note', 'pathology_report', 'other');

-- AlterTable
ALTER TABLE "ImportJob" ADD COLUMN     "kind" "ImportKind" NOT NULL DEFAULT 'lab';

-- CreateTable
CREATE TABLE "ClinicalDocument" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "type" "ClinicalDocType" NOT NULL,
    "title" TEXT NOT NULL,
    "organization" TEXT,
    "author" TEXT,
    "serviceDate" DATE NOT NULL,
    "content" JSONB NOT NULL,
    "importJobId" TEXT,
    "orderId" TEXT,
    "filedById" TEXT NOT NULL,
    "filedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewComment" TEXT,

    CONSTRAINT "ClinicalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalDocument_importJobId_key" ON "ClinicalDocument"("importJobId");

-- CreateIndex
CREATE INDEX "ClinicalDocument_patientId_serviceDate_idx" ON "ClinicalDocument"("patientId", "serviceDate");

-- CreateIndex
CREATE INDEX "ClinicalDocument_reviewedAt_idx" ON "ClinicalDocument"("reviewedAt");

-- AddForeignKey
ALTER TABLE "ClinicalDocument" ADD CONSTRAINT "ClinicalDocument_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalDocument" ADD CONSTRAINT "ClinicalDocument_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalDocument" ADD CONSTRAINT "ClinicalDocument_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalDocument" ADD CONSTRAINT "ClinicalDocument_filedById_fkey" FOREIGN KEY ("filedById") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalDocument" ADD CONSTRAINT "ClinicalDocument_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Practitioner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
