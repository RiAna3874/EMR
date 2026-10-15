-- Patient text messages (src/lib/sms): an opt-out on the chart and a log of every text.
-- CreateEnum
CREATE TYPE "SmsKind" AS ENUM ('orders', 'refill', 'manual');

-- CreateEnum
CREATE TYPE "SmsStatus" AS ENUM ('queued', 'sent', 'failed', 'logged');

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "smsOptOutAt" TIMESTAMP(3),
ADD COLUMN     "smsOptOutById" TEXT;

-- CreateTable
CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" "SmsKind" NOT NULL,
    "status" "SmsStatus" NOT NULL DEFAULT 'queued',
    "provider" TEXT,
    "providerRef" TEXT,
    "error" TEXT,
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SmsMessage_patientId_createdAt_idx" ON "SmsMessage"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "SmsMessage_createdAt_idx" ON "SmsMessage"("createdAt");

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "Practitioner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
