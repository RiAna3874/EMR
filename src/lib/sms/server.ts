import "server-only";
import { after } from "next/server";
import type { ServiceRequest, SmsKind } from "@prisma/client";
import { baseDb, db } from "@/lib/db";
import { parseSteps, stepsFrequency } from "@/lib/meds/steps";
import { brand } from "@/lib/brand";
import { orderableByCode } from "@/lib/orders/catalog";
import type { RxDetails } from "@/lib/meds/rx";
import { gatewayConfig, sendSms } from "./gateway";
import { refillApprovedText, signedOrdersText, smsLang, smsNumber, type SignedItems, type SmsOptions } from "./sms";

// How texts read on this site: from the product name, with the clinic's number when one is set,
// and naming medicines and tests only when MERIDIAN_SMS_DETAILS=1.
function options(preferredLanguage: string): SmsOptions {
  return {
    lang: smsLang(preferredLanguage),
    sender: brand.shortName,
    clinicPhone: process.env.MERIDIAN_CLINIC_PHONE?.trim() || null,
    details: process.env.MERIDIAN_SMS_DETAILS === "1",
  };
}

// Why this patient can't get texts, or null if they can.
export function cantText(p: { phone: string | null; smsOptOutAt: Date | null }): string | null {
  if (p.smsOptOutAt) return "The patient asked not to get texts.";
  if (!p.phone) return "No phone number on file.";
  if (!smsNumber(p.phone)) return "The phone number on file isn't a mobile number.";
  return null;
}

const patientForText = (patientId: string) =>
  db.patient.findUnique({ where: { id: patientId }, select: { id: true, phone: true, smsOptOutAt: true, preferredLanguage: true, mergedIntoId: true } });

// Logs the text on the patient's chart and sends it once the page has its answer, so a slow
// or failing gateway never holds up signing. Returns null when the patient can't get texts.
export async function queueText(patientId: string, kind: SmsKind, body: string, sentById: string | null) {
  const p = await patientForText(patientId);
  if (!p || p.mergedIntoId || cantText(p)) return null;
  // Without a gateway there's nothing to wait for: the text is logged as not sent straight away.
  const status = gatewayConfig() ? "queued" : "logged";
  const msg = await db.smsMessage.create({ data: { patientId, to: smsNumber(p.phone)!, body, kind, sentById, status } });
  if (status === "queued") after(() => deliver(msg.id));
  return msg;
}

// Texts still waiting a minute after they were queued, because the server restarted before
// sending them or the gateway was set up since. Sent after the page that found them responds.
export async function sendStuckTexts(where: { patientId?: string } = {}) {
  const stuck = await baseDb.smsMessage.findMany({
    where: { ...where, status: "queued", createdAt: { lt: new Date(Date.now() - 60_000) } },
    select: { id: true },
    take: 20,
  });
  if (stuck.length) after(async () => { for (const m of stuck) await deliver(m.id); });
}

// Hands one queued text to the gateway and records what it said. Without a gateway the
// text stays in the log as "not sent".
export async function deliver(id: string) {
  const msg = await baseDb.smsMessage.findUnique({ where: { id } });
  if (!msg || msg.status !== "queued") return;
  const cfg = gatewayConfig();
  if (!cfg) {
    await baseDb.smsMessage.update({ where: { id }, data: { status: "logged" } });
    return;
  }
  const res = await sendSms(cfg, msg.to, msg.body, msg.id);
  await baseDb.smsMessage.update({
    where: { id },
    data: res.ok
      ? { status: "sent", provider: cfg.provider, providerRef: res.ref, sentAt: new Date(), error: null }
      : { status: "failed", provider: cfg.provider, error: res.error.slice(0, 500) },
  });
  if (!res.ok) console.error(`SMS ${id} not sent: ${res.error}`);
}

export const fasting = (code: string) => /fasting/i.test(`${orderableByCode.get(code)?.display ?? ""} ${orderableByCode.get(code)?.specimen ?? ""}`);

// One text for everything signed together: prescriptions and orders.
export async function textSignedOrders(patientId: string, prescriber: string, signed: ServiceRequest[], sentById: string) {
  const p = await patientForText(patientId);
  if (!p) return null;
  const items: SignedItems = { prescriber, meds: [], labs: [], imaging: [], referrals: [], procedures: [] };
  for (const o of signed) {
    if (o.type === "medication") {
      const d = (o.details ?? {}) as Partial<RxDetails>;
      const steps = parseSteps(d.steps);
      items.meds.push({ drug: o.display, dose: d.dose, frequency: steps ? stepsFrequency(steps) : d.frequency });
    } else if (o.type === "lab") items.labs.push({ display: o.display, fasting: fasting(o.code) });
    else if (o.type === "imaging") items.imaging.push(o.display);
    else if (o.type === "referral") items.referrals.push(o.display);
    else items.procedures.push(o.display);
  }
  const body = signedOrdersText(items, options(p.preferredLanguage));
  return body ? queueText(patientId, "orders", body, sentById) : null;
}

export async function textRefillApproved(patientId: string, prescriber: string, drug: string, sentById: string) {
  const p = await patientForText(patientId);
  if (!p) return null;
  return queueText(patientId, "refill", refillApprovedText(prescriber, drug, options(p.preferredLanguage)), sentById);
}
