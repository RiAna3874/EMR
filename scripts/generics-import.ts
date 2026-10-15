// Copies the worldwide generic names (RxNorm and Wikidata) into the database, as
// Admin > Drug list does. For a server that can't run the refresh itself.
//   npm run drugs:generics
import { PrismaClient } from "@prisma/client";
import { downloadGenerics, saveGenerics } from "../src/lib/meds/generics-server";

const prisma = new PrismaClient();

async function main() {
  const rows = await downloadGenerics((step, count) => console.log(`step ${step} of 3: ${count} names`));
  await saveGenerics(prisma, rows);
  await prisma.drugListImport.create({ data: { source: "generics", status: "done", count: rows.length, finishedAt: new Date(), startedBy: "command line" } });
  console.log(`Saved ${rows.length} generic names.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
