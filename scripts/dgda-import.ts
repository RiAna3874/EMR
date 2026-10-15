// Copies Bangladesh's DGDA registered drug list into the database, as Admin > Drug list
// does. For a server that can't run the refresh itself, or to load a saved copy.
//   npm run drugs:dgda                       download from the DGHS terminology server
//   npm run drugs:dgda -- --file drugs.json  load a saved JSON list of registry concepts
//   npm run drugs:dgda -- --save drugs.json  download, and also save the list to a file
import { readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { downloadRegistry, saveRegistry } from "../src/lib/meds/dgda-server";
import { registryRow, type OclConcept } from "../src/lib/meds/dgda";

const prisma = new PrismaClient();
const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

async function main() {
  const file = flag("--file");
  const save = flag("--save");
  let rows;
  if (file) {
    const body = JSON.parse(readFileSync(file, "utf8")) as unknown;
    const list = (Array.isArray(body) ? body : (body as { results?: unknown }).results) as OclConcept[];
    rows = list.map(registryRow).filter((r) => r !== null);
  } else {
    rows = await downloadRegistry((page, count) => console.log(`page ${page}: ${count} products`));
  }
  if (save) writeFileSync(save, JSON.stringify(rows.map((r) => ({ id: r.id, extras: { company: r.company, dar_number: r.darNumber, trade_name: r.tradeName, dosage_form: r.dosageForm, generic_content_raw: r.generic }, mappings: r.ingredients ? r.ingredients.split("; ").map((n) => ({ map_type: "Has-active-ingredient", to_concept_name: n })) : [] }))));
  await saveRegistry(prisma, rows);
  await prisma.drugListImport.create({ data: { status: "done", count: rows.length, finishedAt: new Date(), startedBy: file ? `command line (${file})` : "command line" } });
  console.log(`Saved ${rows.length} DGDA registered products.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
