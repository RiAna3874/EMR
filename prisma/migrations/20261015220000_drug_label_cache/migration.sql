-- CreateTable
CREATE TABLE "DrugLabelCache" (
    "key" TEXT NOT NULL,
    "found" BOOLEAN NOT NULL,
    "label" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrugLabelCache_pkey" PRIMARY KEY ("key")
);
