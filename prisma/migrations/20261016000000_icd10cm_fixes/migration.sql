-- Data only: codes saved from the old common diagnosis list that weren't complete ICD-10-CM
-- codes, and one name that described a different code.
--   T14.90 (injury, unspecified) needs its 7th character: T14.90XA, initial encounter.
--   N18.3 (CKD stage 3) was split in 2020: N18.30, stage 3 unspecified.
--   K58.9 is "Irritable bowel syndrome, unspecified", not "without diarrhea".
UPDATE "Condition" SET "code" = 'T14.90XA' WHERE "code" = 'T14.90';
UPDATE "EncounterDiagnosis" SET "code" = 'T14.90XA' WHERE "code" = 'T14.90';
UPDATE "Condition" SET "code" = 'N18.30' WHERE "code" = 'N18.3';
UPDATE "EncounterDiagnosis" SET "code" = 'N18.30' WHERE "code" = 'N18.3';
UPDATE "Condition" SET "display" = 'Irritable bowel syndrome, unspecified' WHERE "code" = 'K58.9' AND "display" = 'Irritable bowel syndrome without diarrhea';
UPDATE "EncounterDiagnosis" SET "display" = 'Irritable bowel syndrome, unspecified' WHERE "code" = 'K58.9' AND "display" = 'Irritable bowel syndrome without diarrhea';
