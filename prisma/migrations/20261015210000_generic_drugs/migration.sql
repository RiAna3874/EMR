-- Worldwide generic names from RxNorm and Wikidata (src/lib/meds/generics.ts), refreshed from Admin > Drug list.
-- AlterTable
ALTER TABLE "DrugListImport" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'dgda';

-- CreateTable
CREATE TABLE "GenericDrug" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "otherNames" TEXT NOT NULL DEFAULT '',
    "bangla" TEXT NOT NULL DEFAULT '',
    "atc" TEXT NOT NULL DEFAULT '',
    "classes" TEXT NOT NULL DEFAULT '',
    "rxcui" TEXT,
    "wikidata" TEXT,
    "search" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenericDrug_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GenericDrug_name_idx" ON "GenericDrug"("name");
