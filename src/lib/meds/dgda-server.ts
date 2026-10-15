// Copies the DGDA registered drug list (dgda.ts) from the DGHS terminology server into
// the RegisteredDrug table, and searches it. A refresh runs in the background from
// Admin > Drug list, or from the command line: npm run drugs:dgda
import type { PrismaClient } from "@prisma/client";
import { DGDA_URL, rankRegistered, registeredCode, registeredDisplay, registryRow, type OclConcept, type RegisteredHit, type RegisteredRow } from "./dgda";

const PAGE_SIZE = 500;
const MAX_PAGES = 400; // 200,000 products: far more than the registry has
// A response this small is a broken server, not the registry: keep the list we have.
const MIN_PRODUCTS = 1000;
// A refresh still "running" after this long died with its server.
const STALE_MS = 30 * 60 * 1000;

const sourceUrl = () => process.env.MERIDIAN_DGDA_URL || DGDA_URL;

async function fetchPage(page: number, fetcher: typeof fetch): Promise<OclConcept[]> {
  const url = new URL(sourceUrl());
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("page", String(page));
  url.searchParams.set("verbose", "true");
  url.searchParams.set("includeMappings", "true");
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetcher(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(90_000) });
      // OCL answers past the last page with 404 or an empty list.
      if (res.status === 404 && page > 1) return [];
      if (!res.ok) throw new Error(`the registry answered ${res.status} ${res.statusText} for page ${page}`);
      const body = (await res.json()) as unknown;
      const list = Array.isArray(body) ? body : (body as { results?: unknown })?.results;
      if (!Array.isArray(list)) throw new Error(`page ${page} wasn't a list of drugs`);
      return list as OclConcept[];
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

// Every product in the registry, page by page.
export async function downloadRegistry(onPage?: (page: number, rows: number) => Promise<void> | void, fetcher: typeof fetch = fetch) {
  const rows = new Map<string, RegisteredRow>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const concepts = await fetchPage(page, fetcher);
    for (const c of concepts) {
      const row = registryRow(c);
      if (row) rows.set(row.id, row);
    }
    await onPage?.(page, rows.size);
    if (concepts.length < PAGE_SIZE) break;
  }
  return [...rows.values()];
}

// Replaces the whole list in one transaction, so searches never see half of it.
export async function saveRegistry(prisma: PrismaClient, rows: RegisteredRow[]) {
  if (rows.length < MIN_PRODUCTS) throw new Error(`the registry returned only ${rows.length} products, so the current list was kept`);
  const importedAt = new Date();
  await prisma.$transaction(
    async (tx) => {
      await tx.registeredDrug.deleteMany({});
      for (let i = 0; i < rows.length; i += 2000) {
        await tx.registeredDrug.createMany({ data: rows.slice(i, i + 2000).map((r) => ({ ...r, importedAt })) });
      }
    },
    { timeout: 300_000, maxWait: 30_000 },
  );
}

// Downloads and saves the list, recording progress on a DrugListImport row.
export async function runImport(prisma: PrismaClient, importId: string, fetcher: typeof fetch = fetch) {
  try {
    const rows = await downloadRegistry((page, count) => prisma.drugListImport.update({ where: { id: importId }, data: { pages: page, count } }).then(() => {}), fetcher);
    await saveRegistry(prisma, rows);
    await prisma.drugListImport.update({ where: { id: importId }, data: { status: "done", count: rows.length, finishedAt: new Date() } });
    return rows.length;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("DGDA drug list refresh failed:", e);
    await prisma.drugListImport.update({ where: { id: importId }, data: { status: "failed", error: error.slice(0, 500), finishedAt: new Date() } });
    return null;
  }
}

// Starts a refresh unless one is already running. Returns the running refresh's id.
export async function startImport(prisma: PrismaClient, startedBy: string) {
  const running = await prisma.drugListImport.findFirst({ where: { status: "running" }, orderBy: { startedAt: "desc" } });
  if (running && Date.now() - running.startedAt.getTime() < STALE_MS) return running.id;
  if (running) await prisma.drugListImport.update({ where: { id: running.id }, data: { status: "failed", error: "Stopped before it finished (the server restarted).", finishedAt: new Date() } });
  const { id } = await prisma.drugListImport.create({ data: { status: "running", startedBy } });
  // Runs on after the admin page answers; the page shows its progress.
  void runImport(prisma, id);
  return id;
}

// Brands, generics or companies matching every typed word.
export async function searchRegistered(prisma: PrismaClient, q: string, limit = 12): Promise<RegisteredHit[]> {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 0).slice(0, 6);
  if (!words.length || q.trim().length < 2) return [];
  const all = words.map((w) => ({ search: { contains: w } }));
  // Brands starting with the first word first: "napa" has to find Napa among the
  // hundreds of products that only contain the letters.
  const [lead, rest] = await Promise.all([
    prisma.registeredDrug.findMany({ where: { AND: [...all, { tradeName: { startsWith: words[0], mode: "insensitive" } }] }, take: 60 }),
    prisma.registeredDrug.findMany({ where: { AND: all }, take: 200 }),
  ]);
  const rows = [...new Map([...lead, ...rest].map((r) => [r.id, r])).values()];
  return rankRegistered(rows, q)
    .slice(0, limit)
    .map((r) => ({
      code: registeredCode(r),
      display: registeredDisplay(r),
      tradeName: r.tradeName,
      generic: r.generic,
      company: r.company,
      dosageForm: r.dosageForm,
      darNumber: r.darNumber,
    }));
}
