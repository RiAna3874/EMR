-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EncounterStatus" ADD VALUE 'roomed';
ALTER TYPE "EncounterStatus" ADD VALUE 'checked_out';
ALTER TYPE "EncounterStatus" ADD VALUE 'no_show';

-- AlterTable
ALTER TABLE "Encounter" ADD COLUMN     "allergiesReviewedAt" TIMESTAMP(3),
ADD COLUMN     "arrivedAt" TIMESTAMP(3),
ADD COLUMN     "bookingNote" TEXT,
ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "chiefComplaint" TEXT,
ADD COLUMN     "copayCents" INTEGER,
ADD COLUMN     "copayMethod" TEXT,
ADD COLUMN     "medsReviewedAt" TIMESTAMP(3),
ADD COLUMN     "rescheduledToId" TEXT,
ADD COLUMN     "room" TEXT,
ADD COLUMN     "statusAt" TIMESTAMP(3),
ADD COLUMN     "visitType" TEXT NOT NULL DEFAULT 'follow_up';

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "insuranceMemberId" TEXT,
ADD COLUMN     "insurancePayer" TEXT;

-- CreateTable
CREATE TABLE "EncounterEvent" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "byId" TEXT NOT NULL,

    CONSTRAINT "EncounterEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleSession" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "slotMinutes" INTEGER NOT NULL DEFAULT 20,

    CONSTRAINT "ScheduleSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleBlock" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EncounterEvent_encounterId_at_idx" ON "EncounterEvent"("encounterId", "at");

-- CreateIndex
CREATE INDEX "ScheduleSession_practitionerId_weekday_idx" ON "ScheduleSession"("practitionerId", "weekday");

-- CreateIndex
CREATE INDEX "ScheduleBlock_practitionerId_start_idx" ON "ScheduleBlock"("practitionerId", "start");

-- CreateIndex
CREATE UNIQUE INDEX "Encounter_rescheduledToId_key" ON "Encounter"("rescheduledToId");

-- CreateIndex
CREATE INDEX "Encounter_providerId_start_idx" ON "Encounter"("providerId", "start");

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_rescheduledToId_fkey" FOREIGN KEY ("rescheduledToId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterEvent" ADD CONSTRAINT "EncounterEvent_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterEvent" ADD CONSTRAINT "EncounterEvent_byId_fkey" FOREIGN KEY ("byId") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleSession" ADD CONSTRAINT "ScheduleSession_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

