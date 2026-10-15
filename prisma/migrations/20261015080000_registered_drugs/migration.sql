-- Bangladesh's DGDA-registered drug products (src/lib/meds/dgda.ts), refreshed from Admin > Drug list.
-- CreateTable
CREATE TABLE "RegisteredDrug" (
    "id" TEXT NOT NULL,
    "darNumber" TEXT NOT NULL,
    "tradeName" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "dosageForm" TEXT NOT NULL,
    "generic" TEXT NOT NULL,
    "ingredients" TEXT NOT NULL DEFAULT '',
    "search" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegisteredDrug_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrugListImport" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "pages" INTEGER NOT NULL DEFAULT 0,
    "count" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "startedBy" TEXT,

    CONSTRAINT "DrugListImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegisteredDrug_tradeName_idx" ON "RegisteredDrug"("tradeName");
