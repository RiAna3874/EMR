-- Day notes on the Blood sugar tab.
-- CreateTable
CREATE TABLE "BloodSugarNote" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BloodSugarNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BloodSugarNote_patientId_day_key" ON "BloodSugarNote"("patientId", "day");

-- AddForeignKey
ALTER TABLE "BloodSugarNote" ADD CONSTRAINT "BloodSugarNote_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloodSugarNote" ADD CONSTRAINT "BloodSugarNote_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

