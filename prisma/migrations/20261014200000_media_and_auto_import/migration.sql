-- AlterTable
ALTER TABLE "ImportJob" ADD COLUMN     "autoKind" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "MediaItem" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "bodySite" TEXT,
    "description" TEXT,
    "takenAt" TIMESTAMP(3) NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "data" BYTEA NOT NULL,
    "thumb" BYTEA,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "importJobId" TEXT,
    "enteredInErrorAt" TIMESTAMP(3),
    "enteredInErrorReason" TEXT,
    "enteredInErrorById" TEXT,

    CONSTRAINT "MediaItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaItem_patientId_takenAt_idx" ON "MediaItem"("patientId", "takenAt");

-- AddForeignKey
ALTER TABLE "MediaItem" ADD CONSTRAINT "MediaItem_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaItem" ADD CONSTRAINT "MediaItem_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
