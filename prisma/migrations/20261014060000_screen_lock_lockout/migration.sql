-- Idle screen lock, and sign-in lockout kept in the database instead of server memory.
ALTER TABLE "Session" ADD COLUMN "lockedAt" TIMESTAMP(3);
ALTER TABLE "Practitioner" ADD COLUMN "failedSignIns" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "signInLockedUntil" TIMESTAMP(3);
