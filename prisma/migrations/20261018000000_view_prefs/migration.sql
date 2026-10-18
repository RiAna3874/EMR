-- Per-person view options: hidden tabs, panels and columns, hover cards on or off.
ALTER TABLE "Practitioner" ADD COLUMN "viewPrefs" JSONB NOT NULL DEFAULT '{}';
