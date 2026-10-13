// Erases every row in the database (patients, staff accounts, everything) and keeps the
// schema, so the next visit to the app opens first-run setup. For turning a demo database
// into an empty one. Run: npm run db:empty -- --yes
// With --guard it erases nothing and only fails on a live database; npm run db:reset runs it first.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const args = new Set(process.argv.slice(2));
// Same list as prisma/seed.ts: anything else is a real account.
const DEMO_USERNAMES = ["dchen", "ribarra", "lbrandt", "hmarsh", "klund", "tmbeki"];

async function main() {
  const host = new URL(process.env.DATABASE_URL ?? "postgresql://unset").host;
  const [patients, accounts] = await Promise.all([prisma.patient.count(), prisma.practitioner.findMany({ select: { username: true } })]);
  const real = accounts.map((a) => a.username).filter((u): u is string => !!u && !DEMO_USERNAMES.includes(u));

  if (args.has("--guard")) {
    if (process.env.NODE_ENV === "production" || real.length) {
      console.error(`Refusing: ${host} looks like a live database (${process.env.NODE_ENV === "production" ? "NODE_ENV=production" : `accounts ${real.slice(0, 5).join(", ")}`}). db:reset would drop it.`);
      process.exitCode = 1;
    }
    return;
  }
  console.log(`Database at ${host}: ${patients} patients, ${accounts.length} staff accounts.`);

  if (!args.has("--yes")) {
    console.log("Nothing erased. To erase every patient, account and record in this database, run: npm run db:empty -- --yes");
    return;
  }
  // Real accounts mean real use. Make the operator say so explicitly.
  if (real.length && !args.has("--including-real-accounts")) {
    console.error(`Refusing: this database has accounts that aren't demo accounts (${real.slice(0, 5).join(", ")}). It may hold real records.`);
    console.error("If you really mean to erase it, back it up first and add --including-real-accounts.");
    process.exitCode = 1;
    return;
  }

  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  }
  // New patients are numbered from the start again (see the patient registration migration).
  await prisma.$executeRawUnsafe(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'patient_mrn_seq') THEN PERFORM setval('patient_mrn_seq', 2000001, false); END IF; END $$`);
  console.log(`Erased ${tables.length} tables. Open the app to create the first administrator at /setup.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
