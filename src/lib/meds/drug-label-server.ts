// Looks up a medicine's prescribing label on openFDA (drug-label.ts) and keeps it in
// DrugLabelCache. Set OPENFDA_API_KEY for openFDA's higher daily limit (free at
// open.fda.gov); without one it allows about 1,000 lookups a day, plenty with the cache.
import type { Prisma, PrismaClient } from "@prisma/client";
import { OPENFDA_LABEL_URL, genericNamesFor, labelSearch, parseLabels, pickLabel, toDrugLabel, type DrugLabel } from "./drug-label";

const FOUND_DAYS = 30;
const NOT_FOUND_DAYS = 7;
const DAY = 86_400_000;

export type DrugInfo = { names: string[]; label: DrugLabel | null; error?: string };

// One openFDA search: the labels for all these ingredients, or none (openFDA answers 404).
export async function fetchLabel(names: string[], fetcher: typeof fetch = fetch): Promise<DrugLabel | null> {
  const url = new URL(process.env.MERIDIAN_OPENFDA_URL || OPENFDA_LABEL_URL);
  url.searchParams.set("search", labelSearch(names));
  url.searchParams.set("limit", "25");
  if (process.env.OPENFDA_API_KEY) url.searchParams.set("api_key", process.env.OPENFDA_API_KEY);
  const res = await fetcher(url.toString(), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(res.status === 429 ? "openFDA's daily limit is used up; try again later" : `openFDA answered ${res.status}`);
  const raw = pickLabel(parseLabels(await res.json()), names);
  return raw ? toDrugLabel(raw) : null;
}

// Other names for a generic from the worldwide list, e.g. a US name RxNorm uses.
async function otherNamesFor(prisma: PrismaClient, name: string): Promise<string[]> {
  const row = await prisma.genericDrug.findFirst({ where: { name: { equals: name, mode: "insensitive" } } }).catch(() => null);
  return (row?.otherNames ?? "")
    .split(";")
    .map((n) => n.trim().toLowerCase())
    .filter((n) => n.length >= 3 && /^[a-z][a-z \-]+$/.test(n))
    .slice(0, 3);
}

export async function drugInfo(prisma: PrismaClient, drug: string, fetcher: typeof fetch = fetch): Promise<DrugInfo> {
  const names = genericNamesFor(drug);
  if (!names.length) return { names, label: null };
  const key = [...names].sort().join("+").slice(0, 300);
  const cached = await prisma.drugLabelCache.findUnique({ where: { key } });
  if (cached && Date.now() - cached.fetchedAt.getTime() < (cached.found ? FOUND_DAYS : NOT_FOUND_DAYS) * DAY) {
    return { names, label: cached.found ? (cached.label as unknown as DrugLabel) : null };
  }
  try {
    let label = await fetchLabel(names, fetcher);
    // A single generic the US knows by another name: try the names from the generic list.
    if (!label && names.length === 1) {
      for (const other of await otherNamesFor(prisma, names[0])) {
        if ((label = await fetchLabel([other], fetcher))) break;
      }
    }
    // A label not found leaves any older one in place; it is only read when found.
    const data = { found: !!label, label: (label ?? undefined) as unknown as Prisma.InputJsonValue | undefined, fetchedAt: new Date() };
    await prisma.drugLabelCache.upsert({ where: { key }, create: { key, ...data }, update: data });
    return { names, label };
  } catch (e) {
    // A stale label is better than none when openFDA can't be reached.
    if (cached?.found) return { names, label: cached.label as unknown as DrugLabel };
    return { names, label: null, error: e instanceof Error ? e.message : String(e) };
  }
}
