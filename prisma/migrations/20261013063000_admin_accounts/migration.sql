-- Staff account management: admins and temporary passwords.
ALTER TABLE "Practitioner" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Practitioner" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
