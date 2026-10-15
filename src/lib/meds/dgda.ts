// Bangladesh's registered drug products (DGDA), as published on the DGHS national
// terminology server (an Open Concept Lab server). About 39,000 brands, each with its
// DAR number, company, dosage form and generic with strength; no doses or indications.
// The list is copied into the RegisteredDrug table (dgda-server.ts) and searched there.
//
// A prescription for a registered brand carries the brand in its code,
// "RX:DGDA:<DAR number>:<display>", like off-list medications do, so it reads back
// anywhere without the table. Safety checks find the generic in the display name.

import type { Product } from "./formulary";
import { usualRoute } from "./drugs";

export const DGDA_URL =
  "https://tr.ocl.dghs.gov.bd/api/orgs/MoHFW/collections/dgda-registered-drugs-valueset/concepts/";

// One concept as the OCL API returns it with verbose=true (and includeMappings=true).
export type OclConcept = {
  id?: string;
  display_name?: string;
  concept_class?: string;
  retired?: boolean;
  extras?: { company?: string; dar_number?: string; trade_name?: string; dosage_form?: string; generic_content_raw?: string } | null;
  mappings?: { map_type?: string; to_concept_name?: string | null }[] | null;
};

export type RegisteredRow = {
  id: string;
  darNumber: string;
  tradeName: string;
  company: string;
  dosageForm: string;
  generic: string;
  ingredients: string;
  search: string;
};

// A search result, for the prescription and outside-medication pickers.
export type RegisteredHit = { code: string; display: string; tradeName: string; generic: string; company: string; dosageForm: string; darNumber: string };

const clean = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");

export function registryRow(c: OclConcept): RegisteredRow | null {
  if (!c || c.retired || (c.concept_class && c.concept_class !== "Drug")) return null;
  const x = c.extras ?? {};
  const id = clean(c.id);
  const tradeName = clean(x.trade_name) || clean(c.display_name);
  const generic = clean(x.generic_content_raw);
  if (!id || !tradeName || !generic) return null;
  const ingredients = [
    ...new Set((c.mappings ?? []).filter((m) => m.map_type === "Has-active-ingredient").map((m) => clean(m.to_concept_name)).filter(Boolean)),
  ].join("; ");
  const row = {
    id,
    darNumber: clean(x.dar_number) || id.split("--")[0],
    tradeName,
    company: clean(x.company),
    dosageForm: clean(x.dosage_form),
    generic,
    ingredients,
  };
  return { ...row, search: [row.tradeName, row.generic, row.ingredients, row.company, row.dosageForm].join(" ").toLowerCase() };
}

// "Tricalm 5 (Trihexyphenidyl Hydrochloride 5 mg) tablet". The generic is in the
// name so the checks, the medication list and printed prescriptions all show it.
export function registeredDisplay(r: Pick<RegisteredRow, "tradeName" | "generic" | "dosageForm">) {
  const form = r.dosageForm.toLowerCase();
  return `${r.tradeName} (${r.generic})${form ? ` ${form}` : ""}`.replace(/\s+/g, " ").trim().slice(0, 160);
}

const PREFIX = "DGDA:";
export const registeredCode = (r: Pick<RegisteredRow, "darNumber" | "tradeName" | "generic" | "dosageForm">) =>
  `RX:${PREFIX}${r.darNumber.replace(/[^0-9A-Za-z-]/g, "")}:${registeredDisplay(r)}`;

// How a dosage form is dispensed and taken.
function formFacts(display: string): Pick<Product, "unit" | "countable" | "route"> {
  const f = display.toLowerCase().replace(/^.*\)\s*/, ""); // the form, after the generic
  if (/tablet|caplet/.test(f)) return { unit: "tablets", countable: true, route: "oral" };
  if (/capsule/.test(f) && !/inhal/.test(f)) return { unit: "capsules", countable: true, route: "oral" };
  const route = /eye|ophthalmic/.test(f)
    ? "ophthalmic"
    : /ear|otic/.test(f)
      ? "otic"
      : /nasal/.test(f)
        ? "nasal"
        : /inhal|aerosol|respirator|nebul/.test(f)
          ? "inhaled"
          : /suppositor|rectal|enema/.test(f)
            ? "rectal"
            : /vaginal|pessar/.test(f)
              ? "vaginal"
              : /cream|ointment|gel|lotion|topical|patch|shampoo|soap|powder for skin|dusting/.test(f)
                ? "topical"
                : /\biv\b.*\bim\b|\bim\b.*\biv\b/.test(f)
                  ? "intravenous or intramuscular"
                  : /\biv\b|infusion|intravenous/.test(f)
                    ? "intravenous"
                    : /\bim\b|intramuscular/.test(f)
                      ? "intramuscular"
                      : /\bsc\b|subcutaneous|pen\b|prefilled/.test(f)
                        ? "subcutaneous"
                        : /inject/.test(f)
                          ? "injection"
                          : "oral";
  return { unit: f || "packs", countable: false, route };
}

// The strength of one tablet or capsule in mg, when the product has a single one.
function singleStrengthMg(display: string): number | undefined {
  const generic = display.match(/\(([^()]*)\)/)?.[1] ?? "";
  const strengths = [...generic.matchAll(/(\d+(?:\.\d+)?)\s*(mg|mcg|µg|microgram|gm|g)\b(?!\s*\/)/gi)];
  if (strengths.length !== 1) return undefined;
  const n = Number(strengths[0][1]);
  const unit = strengths[0][2].toLowerCase();
  return unit === "mg" ? n : unit === "gm" || unit === "g" ? n * 1000 : n / 1000;
}

export function registeredProduct(dar: string, displayName: string): Product | undefined {
  const display = displayName.replace(/\s+/g, " ").trim();
  if (!dar || display.length < 2) return undefined;
  const facts = formFacts(display);
  // "Injection" alone: the ingredient says how (insulin and GLP-1 drugs under the skin).
  if (facts.route === "injection") facts.route = usualRoute(display) ?? "injection";
  const unitMg = facts.countable ? singleStrengthMg(display) : undefined;
  const mg = unitMg === undefined ? "" : unitMg < 1 ? `${+(unitMg * 1000).toFixed(3)} mcg` : `${+unitMg.toFixed(3)} mg`;
  return {
    rxnorm: `${PREFIX}${dar}:${display}`,
    display,
    ...facts,
    unitMg,
    // No usual dose or frequency in the registry: the prescriber writes the sig.
    dose: mg,
    frequency: "",
    days: 0,
    quantity: "",
    refills: 0,
    dar,
  };
}

// The product for a "DGDA:<dar>:<display>" code (with or without "RX:").
export function registeredFromCode(code: string | null | undefined): Product | undefined {
  const raw = code?.replace(/^RX:/, "");
  if (!raw?.startsWith(PREFIX)) return undefined;
  const rest = raw.slice(PREFIX.length);
  const i = rest.indexOf(":");
  return i > 0 ? registeredProduct(rest.slice(0, i), rest.slice(i + 1)) : undefined;
}

// Search words against a row's search text: every word must appear. Brands that
// start with the first word come first, then shorter names.
export function rankRegistered<T extends Pick<RegisteredRow, "tradeName" | "search">>(rows: T[], q: string): T[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const first = words[0] ?? "";
  return rows
    .filter((r) => words.every((w) => r.search.includes(w)))
    .map((r) => {
      const name = r.tradeName.toLowerCase();
      return { r, score: name === first ? 0 : name.startsWith(first) ? 1 : r.search.includes(` ${first}`) ? 2 : 3 };
    })
    .sort((a, b) => a.score - b.score || a.r.tradeName.length - b.r.tradeName.length || a.r.tradeName.localeCompare(b.r.tradeName))
    .map((x) => x.r);
}
