// What a one-click order starts with in the order basket: routine, due today for
// labs, imaging and procedures, and linked to the patient's problem it is plainly
// for (an A1c to diabetes). Everything can be changed in the basket before signing.
import type { OrderPriority } from "@prisma/client";
import type { Orderable, OrderSet } from "./catalog";

export type OrderDefaults = { priority: OrderPriority; expectedAt: string | null; conditionId: string | null };

type Problem = { id: string; display: string };

export const takesDueDate = (o: Pick<Orderable, "type">) => o.type === "lab" || o.type === "imaging" || o.type === "procedure";

// The one active problem whose name contains one of the order's keywords (or the
// set's problem word). None, or more than one, links nothing.
export function suggestProblem(o: Pick<Orderable, "keywords">, problems: Problem[], set?: Pick<OrderSet, "problem">): Problem | null {
  const pick = (words: string[]) => {
    const hits = problems.filter((p) => {
      const name = p.display.toLowerCase();
      return words.some((w) => w.length >= 4 && name.includes(w.toLowerCase()));
    });
    return hits.length === 1 ? hits[0] : null;
  };
  return (set?.problem ? pick([set.problem]) : null) ?? pick(o.keywords ?? []);
}

export function orderDefaults(o: Orderable, problems: Problem[], today: string, set?: Pick<OrderSet, "problem">): OrderDefaults {
  return {
    priority: "routine",
    expectedAt: takesDueDate(o) ? today : null,
    conditionId: suggestProblem(o, problems, set)?.id ?? null,
  };
}
