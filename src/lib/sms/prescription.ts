import "server-only";
import { db } from "@/lib/db";
import { brand } from "@/lib/brand";
import { fmtDate } from "@/lib/format";
import { visitDetails } from "@/lib/visits/server";
import { followUpOption, fromDbDate } from "@/lib/visits/follow-up";
import { bnDate } from "@/lib/visits/bangla";
import { doseSchedules, stepWords, type Schedule } from "@/lib/meds/schedule";
import { productFor } from "@/lib/meds/formulary";
import { cantText, fasting } from "./server";
import { prescriptionText, smsLang, smsNumber, type SmsLang } from "./sms";

export type VisitRxText = { text: string | null; to: string | null; lang: SmsLang; blocked: string | null };

// The visit prescription as a text, in the patient's language: the same medicines, 1+0+1
// schedules, tests and next visit as the printed "Prescribed today" copy.
export async function visitPrescriptionText(patientId: string, encounterId: string): Promise<VisitRxText | null> {
  const visit = await db.encounter.findFirst({ where: { id: encounterId, patientId }, include: { patient: true, provider: true } });
  if (!visit) return null;
  const p = visit.patient;
  const lang = smsLang(p.preferredLanguage);
  const details = await visitDetails(visit);
  const meds = details.meds
    .filter((m) => m.status !== "completed")
    .map((m) => {
      const { steps, stop } = doseSchedules({ ...m, start: m.authoredAt }, lang, productFor(m));
      const s = steps[0];
      // "Tab. Napa 500 mg", not "Tab. Napa 500 mg tablet": every character costs in a text.
      const name = s.form ? `${s.form} ${m.drug.replace(/\s+(tablets?|capsules?)$/i, "")}` : m.drug;
      // A dash would make an English text Unicode, which fits less than half as much per SMS.
      const sep = lang === "bn" ? " — " : ", ";
      const sig = (x: Schedule) => [x.pattern, x.amount, x.how, x.food, x.duration].filter(Boolean).join(sep);
      // A taper or "followed by" prescription: "4+0+0, 5 days; then 3+0+0, 5 days; then stop".
      const words = stepWords(lang);
      return [name, steps.map(sig).join(`; ${words.then} `) + (stop ? `; ${words.stop}` : "")].join(sep);
    });
  const tests = details.orders.map((o) => ({ display: o.display, fasting: fasting(o.code) }));

  const follow = followUpOption(visit.followUpInterval);
  const returnOn = visit.followUpDate && fromDbDate(visit.followUpDate);
  const nextVisit = returnOn
    ? lang === "bn"
      ? bnDate(returnOn, { weekday: true })
      : returnOn.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : follow
      ? lang === "bn"
        ? follow.bn
        : `in ${follow.label.toLowerCase()}`
      : null;

  const text = prescriptionText(
    {
      doctor: visit.provider?.name ?? "",
      date: lang === "bn" ? bnDate(visit.start) : fmtDate(visit.start),
      meds,
      tests,
      nextVisit,
    },
    { lang, sender: brand.shortName, clinicPhone: process.env.MERIDIAN_CLINIC_PHONE?.trim() || null },
  );
  const to = smsNumber(p.phone);
  const blocked = cantText(p) ?? (text ? null : "Nothing to send yet: no medicines or tests were signed at this visit.");
  return { text, to, lang, blocked };
}
