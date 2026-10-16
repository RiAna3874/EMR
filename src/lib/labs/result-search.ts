// Searching the Results tab: a result matches when every word typed appears somewhere in
// its test name, code, the names labs print for it (catalog aliases: "sgpt" finds ALT),
// its values, units and flags, its panel and section, or the report it came from.

import type { Flag } from "@prisma/client";
import { analyteByLoinc, normKey } from "./catalog";

const FLAG_WORDS: Record<Flag, string> = {
  N: "normal",
  L: "low abnormal out of range",
  H: "high abnormal out of range",
  LL: "critical low abnormal out of range",
  HH: "critical high abnormal out of range",
  A: "abnormal out of range",
};

export const queryTokens = (q: string | undefined) => normKey(q ?? "").split(" ").filter(Boolean);
export const matchesTokens = (hay: string, tokens: string[]) => tokens.every((t) => hay.includes(t));

type SearchableObs = { code: string; display: string; valueNum: number | null; valueText: string | null; unit: string | null; flag: Flag | null };

export function obsHaystack(o: SearchableObs, extra: (string | null | undefined)[] = []) {
  return normKey(
    [o.display, o.code, ...(analyteByLoinc.get(o.code)?.aliases ?? []), o.valueText, o.valueNum?.toString(), o.unit, o.flag ? FLAG_WORDS[o.flag] : null, ...extra]
      .filter(Boolean)
      .join(" | "),
  );
}
