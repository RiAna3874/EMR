// One-click refill: the same prescription again, exactly as it was written. Works for
// any medication on the list, outside or over-the-counter ones included: refilling one
// of those writes it as a prescription from this clinic.
import type { MedicationRequest } from "@prisma/client";
import { maxRefills } from "./checks";
import { offListProduct, productFor, type Product } from "./formulary";
import { daysSupplyFor, suggestQuantity } from "./sig";
import { rxClassFor, type RxDetails } from "./rx";

type RefillSource = Pick<
  MedicationRequest,
  "id" | "drug" | "rxnorm" | "dose" | "route" | "frequency" | "prn" | "prnReason" | "quantity" | "refills" | "daw" | "patientInstructions" | "pharmacyId" | "rxClass"
>;

// The product to prescribe: the one on the list, else the medication by name, unchecked.
export const refillProduct = (m: Pick<RefillSource, "drug" | "rxnorm">): Product | undefined => productFor(m) ?? offListProduct(m.drug);

// Why a medication can't be refilled in one click, or null if it can. Anything
// refused here can still be refilled with changes through Modify.
export function refillBlocker(m: Pick<RefillSource, "drug" | "rxnorm" | "dose" | "frequency">): string | null {
  if (!refillProduct(m)) return `${m.drug} can't be found to refill. Use Modify.`;
  if (!m.dose.trim() || !m.frequency.trim()) return `${m.drug} has no dose or frequency. Use Modify to write them.`;
  return null;
}

const MONTH = 30;

// The pending prescription a refill puts in the order basket. A course ("for 7 days")
// is written again as the same course. With no quantity on record (often the case for
// outside medicines), it is worked out for a month at the same sig.
export function refillDetails(m: RefillSource, product: Product, refillRequestId?: string | null): RxDetails {
  const course = m.frequency.match(/^(.*?)\s+for (\d+) days?$/);
  const frequency = course ? course[1] : m.frequency;
  const durationDays = course ? Number(course[2]) : null;
  const sig = { dose: m.dose, frequency };
  const quantity = m.quantity || product.quantity || suggestQuantity(product, sig, durationDays ?? MONTH) || `${durationDays ?? MONTH} days' supply`;
  return {
    dose: m.dose,
    route: m.route || product.route,
    frequency,
    prn: m.prn,
    prnReason: m.prn ? m.prnReason : null,
    durationDays,
    quantity,
    daysSupply: daysSupplyFor(product, sig, quantity) ?? (/days' supply$/.test(quantity) ? (durationDays ?? MONTH) : null),
    refills: Math.max(0, Math.min(maxRefills(product.display), m.rxClass === "historical" ? 0 : m.refills)),
    rxClass: rxClassFor(m.rxClass),
    pharmacyId: m.pharmacyId,
    daw: m.daw,
    patientInstructions: m.patientInstructions,
    replacesId: m.id,
    refillRequestId: refillRequestId ?? null,
    refill: true,
  };
}
