// One search over the DGDA brands (dgda.ts) and the worldwide generic names
// (generics.ts), for the prescription and outside-medication pickers.
import type { PrismaClient } from "@prisma/client";
import { searchRegistered } from "./dgda-server";
import { searchGenerics } from "./generics-server";

export type DrugHit = { code: string; display: string; detail: string; kind: "dgda" | "generic" };

export async function searchDrugs(prisma: PrismaClient, q: string): Promise<DrugHit[]> {
  const [brands, generics] = await Promise.all([searchRegistered(prisma, q, 10), searchGenerics(prisma, q, 6)]);
  const first = q.trim().toLowerCase().split(/\s+/)[0] ?? "";
  const asGeneric = (g: (typeof generics)[number]): DrugHit => ({
    code: g.code,
    display: g.display,
    detail: [g.otherNames.split("; ").slice(0, 2).join(", "), g.classes.split("; ")[0]].filter(Boolean).join(" · "),
    kind: "generic",
  });
  // A generic named what was typed comes first, then brands, then other generics.
  const lead = generics.filter((g) => g.name.toLowerCase().startsWith(first));
  return [
    ...lead.map(asGeneric),
    ...brands.map((b): DrugHit => ({ code: b.code, display: b.display, detail: b.company, kind: "dgda" })),
    ...generics.filter((g) => !lead.includes(g)).map(asGeneric),
  ];
}
