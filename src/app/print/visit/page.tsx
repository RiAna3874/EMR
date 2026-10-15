import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { age, fmtDate, sexShort } from "@/lib/format";
import { logChartView } from "@/lib/audit/server";
import { visitDetails } from "@/lib/visits/server";
import { vitalsSummary } from "@/lib/visits/vitals-line";
import { adviceLines } from "@/lib/visits/advice";
import { followUpOption, fromDbDate } from "@/lib/visits/follow-up";
import { bnDate } from "@/lib/visits/bangla";
import { doseSchedules, stepWords, type Lang } from "@/lib/meds/schedule";
import { productFor } from "@/lib/meds/formulary";
import { Letterhead, PrintFooter, PrintShell } from "@/components/print/print-shell";

export const dynamic = "force-dynamic";

const L = {
  en: { cc: "Complaints", oe: "On examination", dx: "Diagnosis", tests: "Investigations", advice: "Advice", next: "Next visit", nextOn: "Come back on", allergies: "Allergies", nka: "No known allergies", none: "None", continue: "Continue your other medicines as before." },
  bn: { cc: "সমস্যা", oe: "পরীক্ষা", dx: "রোগ নির্ণয়", tests: "পরীক্ষা-নিরীক্ষা", advice: "উপদেশ", next: "পরবর্তী সাক্ষাৎ", nextOn: "আবার আসবেন", allergies: "এলার্জি", nka: "জানা এলার্জি নেই", none: "নেই", continue: "অন্যান্য ওষুধ আগের মতো চলবে।" },
} as const;

// The paper the patient takes home from a visit, the way Bangladeshi prescriptions are
// laid out: complaints, findings, diagnosis and tests on the left; medicines with their
// 1+0+1 schedule, advice and the next visit on the right. Bangla or English.
export default async function PrintVisit({ searchParams }: { searchParams: Promise<{ encounter?: string; lang?: string; meds?: string }> }) {
  const sp = await searchParams;
  const currentUser = await requirePermission("viewClinical");
  const visit = sp.encounter
    ? await db.encounter.findUnique({ where: { id: sp.encounter }, include: { patient: { include: { allergies: true } }, provider: true } })
    : null;
  if (!visit) notFound();
  const p = visit.patient;
  await logChartView(p.id, "Visit prescription", "print");
  const lang: Lang = sp.lang === "en" ? "en" : "bn";
  const allMeds = sp.meds === "all";
  const t = L[lang];

  const details = await visitDetails(visit);
  const meds = allMeds
    ? await db.medicationRequest.findMany({ where: { patientId: p.id, status: { in: ["active", "on_hold"] } }, orderBy: { authoredAt: "asc" } })
    : details.meds.filter((m) => m.status !== "completed");
  const vitals = vitalsSummary(details.vitals);
  const advice = adviceLines(visit.advice, lang);
  const follow = followUpOption(visit.followUpInterval) ?? (visit.followUpInterval === "date" ? { id: "date", label: "", bn: "" } : undefined);
  const returnOn = visit.followUpDate && fromDbDate(visit.followUpDate);
  const doctor = visit.provider;

  const q = (over: Record<string, string>) => {
    const u = new URLSearchParams({ encounter: visit.id, lang, meds: allMeds ? "all" : "today", ...over });
    return `/print/visit?${u}`;
  };
  const tabs = [
    { label: "বাংলা", href: q({ lang: "bn" }), active: lang === "bn" },
    { label: "English", href: q({ lang: "en" }), active: lang === "en" },
    { label: "Prescribed today", href: q({ meds: "today" }), active: !allMeds },
    { label: "All current medicines", href: q({ meds: "all" }), active: allMeds },
  ];

  return (
    <PrintShell back={`/patients/${p.id}/visit?e=${visit.id}`} tabs={tabs}>
      <div lang={lang === "bn" ? "bn" : "en"} className="visit-rx">
        <Letterhead
          title="Prescription"
          right={
            doctor && (
              <>
                <span className="block text-[12px] font-semibold normal-case">
                  {doctor.name}
                  {doctor.credentials && `, ${doctor.credentials}`}
                </span>
                {doctor.registrationNumber && <span className="block">BMDC reg. no. {doctor.registrationNumber}</span>}
              </>
            )
          }
        />

        <section className="mt-2 flex flex-wrap gap-x-6 gap-y-0.5 border-b border-black pb-1.5 text-[12px]">
          <span>
            <b>Name:</b> {p.firstName} {p.lastName}
          </span>
          <span>
            <b>Age:</b> {age(p.dob, visit.start)} y
          </span>
          <span>
            <b>Sex:</b> {sexShort(p.sex)}
          </span>
          <span>
            <b>MRN:</b> <span className="font-mono">{p.mrn}</span>
          </span>
          <span className="ml-auto">
            <b>Date:</b> {lang === "bn" ? bnDate(visit.start) : fmtDate(visit.start)}
          </span>
        </section>

        <div className="mt-3 grid grid-cols-[34%_1fr] gap-0">
          <div className="space-y-3 border-r border-black/50 pr-3 text-[12px]">
            <Block title={t.cc}>{visit.chiefComplaint ?? visit.reason ?? "—"}</Block>
            {vitals.length > 0 && (
              <Block title={t.oe}>
                <ul>
                  {vitals.map((v) => (
                    <li key={v.label}>
                      {v.label}: {v.value}
                    </li>
                  ))}
                </ul>
              </Block>
            )}
            <Block title={t.dx}>
              {details.diagnoses.length ? (
                <ol className="list-decimal pl-4">
                  {details.diagnoses.map((d) => (
                    <li key={d.id}>{d.display}</li>
                  ))}
                </ol>
              ) : (
                "—"
              )}
            </Block>
            {details.orders.length > 0 && (
              <Block title={t.tests}>
                <ul className="list-disc pl-4">
                  {details.orders.map((o) => (
                    <li key={o.id}>{o.display}</li>
                  ))}
                </ul>
              </Block>
            )}
            <Block title={t.allergies}>
              {p.allergies.length ? p.allergies.map((a) => a.substance).join(", ") : p.allergyStatus === "no_known_allergies" ? t.nka : "—"}
            </Block>
          </div>

          <div className="pl-4">
            <div className="font-serif text-[30px] font-bold leading-none">℞</div>
            {meds.length === 0 ? (
              <p className="mt-2 text-[12px]">{t.none}</p>
            ) : (
              <ol className="mt-2 space-y-2.5">
                {meds.map((m, i) => {
                  const { steps, stop } = doseSchedules({ ...m, start: m.authoredAt }, lang, productFor(m));
                  const s = steps[0];
                  const words = stepWords(lang);
                  const outside = m.rxClass === "historical";
                  return (
                    <li key={m.id} className="flex gap-2 break-inside-avoid">
                      <span className="tabular w-4 shrink-0 text-right">{i + 1}.</span>
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-bold">
                          {s.form && <span className="font-normal">{s.form} </span>}
                          {m.drug}
                          {outside && <span className="ml-1 text-[10.5px] font-normal">({lang === "bn" ? "আগে থেকে চলছে" : "already taking"})</span>}
                        </div>
                        {/* A taper or "followed by" prescription: one line per step, "then" between them. */}
                        {steps.map((step, k) => (
                          <div key={k} className="text-[13px]">
                            {k > 0 && <span className="pr-1.5 italic">{words.then}</span>}
                            {[step.pattern && <b key="p" className="tabular tracking-wide">{step.pattern}</b>, step.amount, step.how, step.food, step.duration]
                              .filter(Boolean)
                              .map((x, j) => (
                                <span key={j}>
                                  {j > 0 && <span className="px-1.5">—</span>}
                                  {x}
                                </span>
                              ))}
                          </div>
                        ))}
                        {stop && <div className="text-[13px] italic">{words.stop}</div>}
                        {m.patientInstructions && <div className="text-[11.5px]">{m.patientInstructions}</div>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {!allMeds && meds.length > 0 && <p className="mt-2 text-[11.5px]">{t.continue}</p>}

            {advice.length > 0 && (
              <div className="mt-5">
                <h3 className="border-b border-black/40 text-[12.5px] font-bold">{t.advice}</h3>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12.5px]">
                  {advice.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            )}

            {follow && (
              <div className="mt-5 rounded border border-black px-3 py-2 text-[13px] break-inside-avoid">
                <b>{t.next}: </b>
                {returnOn
                  ? lang === "bn"
                    ? `${bnDate(returnOn, { weekday: true })}${follow.id !== "date" ? ` (${follow.bn})` : ""}`
                    : `${returnOn.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${follow.id !== "date" ? ` (in ${follow.label})` : ""}`
                  : lang === "bn"
                    ? follow.bn
                    : follow.label.toLowerCase()}
                {visit.followUpNote && <div className="text-[12px]">{visit.followUpNote}</div>}
              </div>
            )}
          </div>
        </div>

        <section className="mt-10 flex justify-end break-inside-avoid">
          <div className="text-center text-[11px]">
            <div className="w-60 border-t border-black pt-0.5">Signature</div>
            {doctor && (
              <div className="font-semibold">
                {doctor.name}
                {doctor.credentials && `, ${doctor.credentials}`}
              </div>
            )}
          </div>
        </section>

        <PrintFooter>
          <div>
            Printed {fmtDate(new Date())} by {currentUser.name}.
          </div>
        </PrintFooter>
      </div>
    </PrintShell>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="break-inside-avoid">
      <h3 className="text-[12px] font-bold underline">{title}</h3>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
