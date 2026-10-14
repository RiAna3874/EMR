import Link from "next/link";
import type { ClinicalDocType } from "@prisma/client";
import { DIAGNOSIS_KINDS, docTypeLabel, MED_CHANGES, type DocContent, type DocMed } from "@/lib/documents/draft";
import { fmtDate, fmtDateOnly, fmtDateTime } from "@/lib/format";

export type FiledDoc = {
  id: string;
  type: ClinicalDocType;
  title: string;
  organization: string | null;
  author: string | null;
  serviceDate: Date;
  content: DocContent;
  filedAt: Date;
  filedBy: { name: string };
  order: { display: string } | null;
  reviewedAt: Date | null;
  reviewedBy: { name: string } | null;
  reviewComment: string | null;
  pages: number;
  importJobId: string | null;
};

const TYPE_TONE: Record<ClinicalDocType, string> = {
  imaging_report: "bg-low-soft text-low",
  discharge_summary: "bg-high-soft text-high",
  referral_letter: "bg-accent-soft text-accent",
  consult_note: "bg-accent-soft text-accent",
  procedure_note: "bg-panel-muted text-ink-2",
  pathology_report: "bg-warn-soft text-warn",
  other: "bg-panel-muted text-ink-2",
};

export function DocTypeChip({ type }: { type: ClinicalDocType }) {
  return <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${TYPE_TONE[type]}`}>{docTypeLabel[type]}</span>;
}

const CHANGE_TONE: Record<DocMed["change"], string> = {
  new: "bg-accent-soft text-ok",
  changed: "bg-warn-soft text-warn",
  stopped: "bg-crit-soft text-crit",
  continued: "bg-panel-muted text-ink-2",
  unknown: "bg-panel-muted text-ink-3",
};

export function ChangeChip({ change }: { change: DocMed["change"] }) {
  return <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase ${CHANGE_TONE[change]}`}>{MED_CHANGES[change]}</span>;
}

const MED_ORDER: DocMed["change"][] = ["new", "changed", "stopped", "continued", "unknown"];
const day = (s: string) => (s ? fmtDate(new Date(`${s}T12:00:00`)) : "");

// A filed outside document, laid out for reading: what it concluded first, then
// what it changed, then the full text. Used in the chart, the Inbox and print.
export function DocView({ doc, patientId, print = false }: { doc: FiledDoc; patientId: string; print?: boolean }) {
  const c = doc.content;
  const meds = [...c.meds].sort((a, b) => MED_ORDER.indexOf(a.change) - MED_ORDER.indexOf(b.change));
  const dateLabel = doc.type === "discharge_summary" && c.admitDate ? `${day(c.admitDate)} to ${day(c.dischargeDate) || fmtDateOnly(doc.serviceDate)}` : fmtDateOnly(doc.serviceDate);
  const sectionTitle = "mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3";

  return (
    <article className="space-y-4">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <DocTypeChip type={doc.type} />
          <span className="rounded border border-line px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-3">OUTSIDE RECORD</span>
          {!print && !doc.reviewedAt && <span className="rounded bg-warn-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-warn">NOT YET REVIEWED</span>}
        </div>
        <h2 className="mt-1.5 text-lg font-semibold leading-tight">{doc.title}</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-2">
          {[doc.organization, doc.author].filter(Boolean).join(" · ")}
          {(doc.organization || doc.author) && " · "}
          {dateLabel}
          {c.modality && ` · ${c.modality}${c.bodyPart ? `, ${c.bodyPart}` : ""}`}
        </p>
        {doc.order && <p className="mt-0.5 text-[12px] text-ink-3">Answers order: {doc.order.display}</p>}
      </header>

      {c.impression && (
        <section className="rounded-md border-l-4 border-accent bg-accent-soft/50 px-3 py-2">
          <div className={sectionTitle}>{doc.type === "imaging_report" ? "Impression" : "Impression / assessment"}</div>
          <p className="whitespace-pre-line font-medium leading-snug">{c.impression}</p>
        </section>
      )}

      {c.followUps.length > 0 && (
        <section className="rounded-md border border-warn/40 bg-warn-soft/60 px-3 py-2">
          <div className={`${sectionTitle} text-warn`}>Follow-up and recommendations</div>
          <ul className="space-y-0.5">
            {c.followUps.map((f) => (
              <li key={f.id} className="flex gap-2">
                <span className="text-warn">▸</span>
                <span className="flex-1">{f.text}</span>
                {f.due && <span className="shrink-0 text-[12px] font-medium text-warn">{/^\d{4}-\d{2}-\d{2}$/.test(f.due) ? day(f.due) : f.due}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {c.measurements.length > 0 && (
        <section>
          <div className={sectionTitle}>Measurements</div>
          <table className="w-full overflow-hidden rounded border border-line text-[12.5px]">
            <tbody className="divide-y divide-line">
              {c.measurements.map((m, i) => (
                <tr key={m.id}>
                  <td className="px-2.5 py-1 text-[11px] text-ink-3">{m.group !== c.measurements[i - 1]?.group ? m.group : ""}</td>
                  <td className="px-2.5 py-1">{m.name}</td>
                  <td className="px-2.5 py-1 text-right font-medium tabular-nums">
                    {m.value} {m.unit && <span className="font-normal text-ink-2">{m.unit}</span>}
                  </td>
                  <td className="px-2.5 py-1 text-ink-3">{m.range}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {(c.diagnoses.length > 0 || meds.length > 0) && (
        <div className={`grid grid-cols-1 gap-4 ${print ? "" : "2xl:grid-cols-2"}`}>
          {c.diagnoses.length > 0 && (
            <section>
              <div className={sectionTitle}>Diagnoses and findings</div>
              <ul className="divide-y divide-line rounded border border-line">
                {c.diagnoses.map((d) => (
                  <li key={d.id} className="flex items-baseline gap-2 px-2.5 py-1.5">
                    <span className="flex-1">{d.text}</span>
                    {d.addToProblems && <span className="rounded bg-accent-soft px-1 text-[10.5px] font-semibold text-ok">ADDED TO PROBLEMS</span>}
                    <span className="text-[11px] text-ink-3">{DIAGNOSIS_KINDS[d.kind]}</span>
                    {d.icd10 && <span className="font-mono text-[11px] text-ink-3">{d.icd10}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {meds.length > 0 && (
            <section>
              <div className={sectionTitle}>Medications in this document</div>
              <ul className="divide-y divide-line rounded border border-line">
                {meds.map((m) => (
                  <li key={m.id} className="flex items-baseline gap-2 px-2.5 py-1.5">
                    <ChangeChip change={m.change} />
                    <span className="flex-1">
                      <span className={m.change === "stopped" ? "line-through decoration-crit/60" : "font-medium"}>{m.drug || m.text}</span>
                      {(m.dose || m.frequency) && <span className="text-ink-2"> {[m.dose, m.route, m.frequency].filter(Boolean).join(" ")}</span>}
                    </span>
                    {m.addToList && <span className="rounded bg-accent-soft px-1 text-[10.5px] font-semibold text-ok">ADDED TO MEDS</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {c.sections.length > 0 && (
        <section>
          <div className={sectionTitle}>Full text</div>
          <div className="space-y-3 rounded border border-line bg-panel px-3 py-2.5">
            {c.sections.map((s) => (
              <div key={s.id}>
                {s.heading && <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-2">{s.heading}</h3>}
                <p className="whitespace-pre-line leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="border-t border-line pt-2 text-[11.5px] text-ink-3">
        Transcribed from {doc.pages} {doc.pages === 1 ? "page" : "pages"}
        {c.printedName && ` (printed for ${c.printedName}${c.printedId ? `, ${c.printedId}` : ""})`}. Verified and filed by {doc.filedBy.name} {fmtDateTime(doc.filedAt)}.
        {doc.reviewedAt && doc.reviewedBy && ` Reviewed by ${doc.reviewedBy.name} ${fmtDateTime(doc.reviewedAt)}${doc.reviewComment ? `: “${doc.reviewComment}”` : "."}`}
        {!print && doc.importJobId && (
          <>
            {" "}
            <Link href={`/patients/${patientId}/import/${doc.importJobId}`} className="text-accent hover:underline">
              View the source pages
            </Link>
          </>
        )}
      </footer>
    </article>
  );
}
