// Copies the worldwide generic names (generics.ts) from RxNorm and Wikidata into the
// GenericDrug table, and searches it. A refresh runs in the background from
// Admin > Drug list, or from the command line: npm run drugs:generics
import type { PrismaClient } from "@prisma/client";
import {
  ATC_CLASSES_URL,
  RXNORM_INGREDIENTS_URL,
  WIKIDATA_QUERY,
  WIKIDATA_SPARQL_URL,
  genericCode,
  mergeGenerics,
  parseAtcClasses,
  parseRxIngredients,
  parseWikidata,
  rankGenerics,
  type GenericHit,
  type GenericRow,
} from "./generics";

// A list this small is a broken answer, not RxNorm: keep the list we have.
const MIN_GENERICS = 5000;
const STALE_MS = 30 * 60 * 1000;
const USER_AGENT = "SAFIX-EMR/1.0 (clinic drug name list; https://github.com/RiAna3874/EMR)";

async function getJson(what: string, url: string, init: RequestInit, fetcher: typeof fetch): Promise<unknown> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetcher(url, { ...init, headers: { Accept: "application/json", "User-Agent": USER_AGENT, ...init.headers }, signal: AbortSignal.timeout(180_000) });
      if (!res.ok) throw new Error(`${what} answered ${res.status} ${res.statusText}`);
      return await res.json();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
    }
  }
  throw last instanceof Error ? last : new Error(`${what}: ${String(last)}`);
}

// Downloads all three sources and joins them.
export async function downloadGenerics(onStep?: (step: number, count: number) => Promise<void> | void, fetcher: typeof fetch = fetch): Promise<GenericRow[]> {
  const rx = parseRxIngredients(await getJson("RxNorm", process.env.MERIDIAN_RXNORM_URL || RXNORM_INGREDIENTS_URL, {}, fetcher));
  await onStep?.(1, rx.length);
  const atc = parseAtcClasses(await getJson("RxNorm's ATC classes", process.env.MERIDIAN_ATC_URL || ATC_CLASSES_URL, {}, fetcher));
  await onStep?.(2, rx.length);
  const wd = parseWikidata(
    await getJson(
      "Wikidata",
      process.env.MERIDIAN_WIKIDATA_URL || WIKIDATA_SPARQL_URL,
      {
        method: "POST",
        headers: { Accept: "application/sparql-results+json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ query: WIKIDATA_QUERY }).toString(),
      },
      fetcher,
    ),
  );
  const rows = mergeGenerics(rx, wd, atc);
  await onStep?.(3, rows.length);
  return rows;
}

export async function saveGenerics(prisma: PrismaClient, rows: GenericRow[]) {
  if (rows.length < MIN_GENERICS) throw new Error(`only ${rows.length} generic names came back, so the current list was kept`);
  const importedAt = new Date();
  await prisma.$transaction(
    async (tx) => {
      await tx.genericDrug.deleteMany({});
      for (let i = 0; i < rows.length; i += 2000) {
        await tx.genericDrug.createMany({ data: rows.slice(i, i + 2000).map((r) => ({ ...r, importedAt })) });
      }
    },
    { timeout: 300_000, maxWait: 30_000 },
  );
}

export async function runGenericsImport(prisma: PrismaClient, importId: string, fetcher: typeof fetch = fetch) {
  try {
    const rows = await downloadGenerics((step, count) => prisma.drugListImport.update({ where: { id: importId }, data: { pages: step, count } }).then(() => {}), fetcher);
    await saveGenerics(prisma, rows);
    await prisma.drugListImport.update({ where: { id: importId }, data: { status: "done", count: rows.length, finishedAt: new Date() } });
    return rows.length;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("Generic names refresh failed:", e);
    await prisma.drugListImport.update({ where: { id: importId }, data: { status: "failed", error: error.slice(0, 500), finishedAt: new Date() } });
    return null;
  }
}

export async function startGenericsImport(prisma: PrismaClient, startedBy: string) {
  const running = await prisma.drugListImport.findFirst({ where: { status: "running", source: "generics" }, orderBy: { startedAt: "desc" } });
  if (running && Date.now() - running.startedAt.getTime() < STALE_MS) return running.id;
  if (running) await prisma.drugListImport.update({ where: { id: running.id }, data: { status: "failed", error: "Stopped before it finished (the server restarted).", finishedAt: new Date() } });
  const { id } = await prisma.drugListImport.create({ data: { source: "generics", status: "running", startedBy } });
  void runGenericsImport(prisma, id);
  return id;
}

// Generic names, other names, Bangla names, classes or ATC codes matching every typed word.
export async function searchGenerics(prisma: PrismaClient, q: string, limit = 8): Promise<GenericHit[]> {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  if (!words.length || q.trim().length < 2) return [];
  const all = words.map((w) => ({ search: { contains: w } }));
  const [lead, rest] = await Promise.all([
    prisma.genericDrug.findMany({ where: { AND: [...all, { name: { startsWith: words[0], mode: "insensitive" } }] }, take: 40 }),
    prisma.genericDrug.findMany({ where: { AND: all }, orderBy: { atc: "desc" }, take: 200 }),
  ]);
  const rows = [...new Map([...lead, ...rest].map((r) => [r.id, r])).values()];
  return rankGenerics(rows, q)
    .slice(0, limit)
    .map((r) => ({ code: genericCode(r), display: r.name, name: r.name, otherNames: r.otherNames, bangla: r.bangla, classes: r.classes }));
}
