// One-click refill: the same prescription again, exactly as it was written.
import type { MedicationRequest } from "@prisma/client";
import { maxRefills } from "./checks";
import type { Product } from "./formulary";
import { daysSupplyFor } from "./sig";
import { rxClassFor, type RxDetails } from "./rx";

type RefillSource = Pick<
  MedicationRequest,
  "id" | "drug" | "status" | "rxClass" | "dose" | "route" | "frequency" | "prn" | "prnReason" | "quantity" | "refills" | "daw" | "patientInstructions" | "pharmacyId"
>;

// Why a medication can't be refilled in one click, or null if it can. Anything
// refused here can still be changed and reordered with Modify.
export function refillBlocker(m: RefillSource, product: Product | undefined): string | null {
  if (m.status !== "active" && m.status !== "on_hold") return `${m.drug} isn't a current medication.`;
  if (m.rxClass === "historical") return `${m.drug} was prescribed elsewhere. Use Prescribe to write it here.`;
  if (!product) return `${m.drug} can't be found to refill. Use Modify.`;
  if (!m.dose || !m.frequency || !(m.quantity || product.quantity)) return `${m.drug} is missing a dose, frequency or quantity. Use Modify.`;
  return null;
}

// The pending prescription a refill puts in the order basket. A course ("for 7 days")
// is written again as the same course.
export function refillDetails(m: RefillSource, product: Product, refillRequestId?: string | null): RxDetails {
  const course = m.frequency.match(/^(.*?)\s+for (\d+) days?$/);
  const frequency = course ? course[1] : m.frequency;
  const quantity = m.quantity || product.quantity;
  return {
    dose: m.dose,
    route: m.route || product.route,
    frequency,
    prn: m.prn,
    prnReason: m.prn ? m.prnReason : null,
    durationDays: course ? Number(course[2]) : null,
    quantity,
    daysSupply: daysSupplyFor(product, { dose: m.dose, frequency }, quantity),
    refills: Math.max(0, Math.min(maxRefills(product.display), m.refills)),
    rxClass: rxClassFor(m.rxClass),
    pharmacyId: m.pharmacyId,
    daw: m.daw,
    patientInstructions: m.patientInstructions,
    replacesId: m.id,
    refillRequestId: refillRequestId ?? null,
    refill: true,
  };
}
