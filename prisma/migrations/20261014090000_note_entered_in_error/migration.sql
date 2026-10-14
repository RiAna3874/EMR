-- Delete a signed note: it is marked entered in error and hidden from the chart, never erased.
-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "enteredInErrorAt" TIMESTAMP(3),
ADD COLUMN     "enteredInErrorById" TEXT,
ADD COLUMN     "enteredInErrorReason" TEXT;
