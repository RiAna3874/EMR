// A prescription while it is an order: what the composer collects and keeps in
// ServiceRequest.details until it is signed and becomes a MedicationRequest.
import type { RxClass } from "@prisma/client";
import { maxRefills } from "./checks";
import { daysSupplyFor, sigText } from "./sig";
import type { Product } from "./formulary";

export type RxDetails = {
  dose: string;
  route: string;
  frequency: string;
  prn?: boolean;
  prnReason?: string | null;
  durationDays?: number | null;
  quantity: string;
  daysSupply?: number | null;
  refills: number;
  rxClass?: RxClass;
  pharmacyId?: string | null;
  daw?: boolean;
  patientInstructions?: string | null;
  // Reorder or change of a current medication: signing replaces it.
  replacesId?: string | null;
  // Written in answer to a pharmacy refill request.
  refillRequestId?: string | null;
  // Added with one-click Refill: the same prescription again, unchanged.
  refill?: boolean;
};

// How a new prescription reaches the patient. The clinic has no electronic link to
// any pharmacy, so every prescription is printed and handed to the patient. Add
// "e_prescribe" or "phone" back here only once a prescription really gets sent.
export const RX_CLASSES: { id: Exclude<RxClass, "historical">; label: string }[] = [{ id: "print", label: "Print" }];

// The class a new prescription gets: what was asked for if the clinic offers it, else print.
export const rxClassFor = (asked: string | null | undefined): Exclude<RxClass, "historical"> =>
  RX_CLASSES.find((c) => c.id === asked)?.id ?? "print";

export const rxClassLabel: Record<RxClass, string> = {
  e_prescribe: "E-prescribed",
  print: "Printed",
  phone: "Phoned in",
  historical: "Outside / OTC",
};

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const int = (f: FormData, k: string) => {
  const n = Number(str(f, k));
  return Number.isFinite(n) && str(f, k) !== "" ? Math.round(n) : null;
};

// Reads the composer's fields, falling back to the product's defaults, and keeps
// refills within what the drug's schedule allows.
export function rxFromForm(form: FormData, product: Product): RxDetails {
  const dose = str(form, "dose") || product.dose;
  const frequency = str(form, "frequency") || product.frequency;
  const quantity = str(form, "quantity") || product.quantity;
  const prn = form.get("prn") === "on";
  const cls = str(form, "rxClass");
  return {
    dose,
    route: str(form, "route") || product.route,
    frequency,
    prn,
    prnReason: prn ? str(form, "prnReason") || product.prnReason || null : null,
    durationDays: int(form, "durationDays"),
    quantity,
    daysSupply: int(form, "daysSupply") ?? daysSupplyFor(product, { dose, frequency }, quantity),
    refills: Math.max(0, Math.min(maxRefills(product.display), int(form, "refills") ?? 0)),
    rxClass: rxClassFor(cls),
    pharmacyId: str(form, "pharmacyId") || null,
    daw: form.get("daw") === "on",
    patientInstructions: str(form, "patientInstructions") || null,
    replacesId: str(form, "replacesId") || null,
    refillRequestId: str(form, "refillRequestId") || null,
  };
}

export function rxSummary(d: Partial<RxDetails> | null | undefined) {
  if (!d?.dose) return "";
  const sig = sigText({ dose: d.dose, route: d.route ?? "", frequency: d.frequency ?? "", prn: d.prn, prnReason: d.prnReason, durationDays: d.durationDays });
  const refills = d.refills ?? 0;
  return `${sig}. Dispense ${d.quantity ?? "?"}${d.daysSupply ? ` (${d.daysSupply}-day supply)` : ""}, ${refills} refill${refills === 1 ? "" : "s"}${d.daw ? ", dispense as written" : ""}.`;
}
