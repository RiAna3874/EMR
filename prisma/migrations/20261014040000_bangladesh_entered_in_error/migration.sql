-- Results, outside documents and vital signs can be marked entered in error.
ALTER TABLE "Observation" ADD COLUMN "enteredInErrorAt" TIMESTAMP(3), ADD COLUMN "enteredInErrorReason" TEXT, ADD COLUMN "enteredInErrorById" TEXT;
ALTER TABLE "DiagnosticReport" ADD COLUMN "enteredInErrorAt" TIMESTAMP(3), ADD COLUMN "enteredInErrorReason" TEXT, ADD COLUMN "enteredInErrorById" TEXT;
ALTER TABLE "ClinicalDocument" ADD COLUMN "enteredInErrorAt" TIMESTAMP(3), ADD COLUMN "enteredInErrorReason" TEXT, ADD COLUMN "enteredInErrorById" TEXT;

-- Bangladeshi mobile numbers saved in US format because registration only took 10 digits:
-- staff dropped the leading 0, so 01712345678 was saved as "(171) 234-5678".
-- Restore them as +880 numbers. Real US numbers can't start 13 to 19.
UPDATE "Patient" SET "phone" = '+880 ' || substr(regexp_replace("phone", '\D', '', 'g'), 1, 4) || '-' || substr(regexp_replace("phone", '\D', '', 'g'), 5)
WHERE "phone" ~ '^\(1[3-9]\d\) \d{3}-\d{4}$';
UPDATE "Patient" SET "emergencyContactPhone" = '+880 ' || substr(regexp_replace("emergencyContactPhone", '\D', '', 'g'), 1, 4) || '-' || substr(regexp_replace("emergencyContactPhone", '\D', '', 'g'), 5)
WHERE "emergencyContactPhone" ~ '^\(1[3-9]\d\) \d{3}-\d{4}$';
