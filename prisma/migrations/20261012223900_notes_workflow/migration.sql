-- AlterEnum
ALTER TYPE "NoteStatus" ADD VALUE 'pending_cosign';

-- AlterEnum
ALTER TYPE "NoteType" ADD VALUE 'procedure';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'resident';

-- DropIndex
DROP INDEX "Note_patientId_createdAt_idx";

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "cosignText" TEXT,
ADD COLUMN     "cosignedAt" TIMESTAMP(3),
ADD COLUMN     "cosignerId" TEXT,
ADD COLUMN     "serviceAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "templateId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing notes: date of service is when they were written.
UPDATE "Note" SET "serviceAt" = "createdAt", "updatedAt" = COALESCE("signedAt", "createdAt");

-- CreateTable
CREATE TABLE "NoteAddendum" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteAddendum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmartPhrase" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmartPhrase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NoteAddendum_noteId_idx" ON "NoteAddendum"("noteId");

-- CreateIndex
CREATE UNIQUE INDEX "SmartPhrase_ownerId_name_key" ON "SmartPhrase"("ownerId", "name");

-- CreateIndex
CREATE INDEX "Note_patientId_serviceAt_idx" ON "Note"("patientId", "serviceAt");

-- CreateIndex
CREATE INDEX "Note_authorId_status_idx" ON "Note"("authorId", "status");

-- CreateIndex
CREATE INDEX "Note_cosignerId_status_idx" ON "Note"("cosignerId", "status");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_cosignerId_fkey" FOREIGN KEY ("cosignerId") REFERENCES "Practitioner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteAddendum" ADD CONSTRAINT "NoteAddendum_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteAddendum" ADD CONSTRAINT "NoteAddendum_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartPhrase" ADD CONSTRAINT "SmartPhrase_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Practitioner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
