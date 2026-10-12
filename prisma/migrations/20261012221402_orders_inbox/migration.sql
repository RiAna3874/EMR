-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('lab', 'imaging', 'medication', 'referral', 'procedure');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'signed', 'completed', 'discontinued');

-- CreateEnum
CREATE TYPE "OrderPriority" AS ENUM ('routine', 'urgent', 'stat');

-- AlterTable
ALTER TABLE "DiagnosticReport" ADD COLUMN     "orderId" TEXT,
ADD COLUMN     "reviewComment" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "type" "OrderType" NOT NULL,
    "code" TEXT NOT NULL,
    "display" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "priority" "OrderPriority" NOT NULL DEFAULT 'routine',
    "indication" TEXT,
    "instructions" TEXT,
    "details" JSONB,
    "orderSet" TEXT,
    "expectedAt" DATE,
    "orderedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "discontinuedAt" TIMESTAMP(3),
    "medicationId" TEXT,

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceRequest_patientId_status_idx" ON "ServiceRequest"("patientId", "status");

-- CreateIndex
CREATE INDEX "ServiceRequest_orderedById_status_idx" ON "ServiceRequest"("orderedById", "status");

-- CreateIndex
CREATE INDEX "DiagnosticReport_reviewedAt_idx" ON "DiagnosticReport"("reviewedAt");

-- AddForeignKey
ALTER TABLE "DiagnosticReport" ADD CONSTRAINT "DiagnosticReport_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticReport" ADD CONSTRAINT "DiagnosticReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Practitioner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_orderedById_fkey" FOREIGN KEY ("orderedById") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
