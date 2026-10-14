-- Edit signed notes: who last edited a note, and every earlier version kept.
-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "editedById" TEXT;

-- CreateTable
CREATE TABLE "NoteVersion" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "type" "NoteType" NOT NULL,
    "body" TEXT NOT NULL,
    "signedById" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL,
    "replacedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NoteVersion_noteId_number_key" ON "NoteVersion"("noteId", "number");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "Practitioner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteVersion" ADD CONSTRAINT "NoteVersion_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteVersion" ADD CONSTRAINT "NoteVersion_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
