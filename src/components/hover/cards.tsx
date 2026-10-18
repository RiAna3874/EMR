import "server-only";
import type { AllergyIntolerance, Condition, DiagnosticReport, Encounter, MedicationRequest, Note, Observation, Practitioner, ServiceRequest } from "@prisma/client";
import { fmtDate, fmtDateOnly, fmtDateTime, fmtRange, fmtValue, relativeDays, unitLabel } from "@/lib/format";
import { flagTitle } from "@/components/flag";
import { icd10Title } from "@/lib/icd10/codes";
import { sigText } from "@/lib/meds/sig";
import { HoverRows, HoverText, HoverTitle } from "./card-parts";

// What each kind of chart item shows in its hover card. Server only (the ICD-10 table is on disk);
// pages pass the result to <Hover card={...}>.

const person = (p: Pick<Practitioner, "name" | "credentials"> | null | undefined) => (p ? `${p.name}${p.credentials ? `, ${p.credentials}` : ""}` : null);

export function ProblemCard({ c }: { c: Pick<Condition, "code" | "display" | "status" | "onset" | "resolvedAt" | "comment"> }) {
  const official = icd10Title(c.code);
  return (
    <>
      <HoverTitle sub={c.status === "resolved" ? "Resolved problem" : "Active problem"}>{c.display}</HoverTitle>
      <HoverRows
        rows={[
          ["ICD-10", <span key="c"><span className="font-mono">{c.code}</span>{official && official.toLowerCase() !== c.display.toLowerCase() && <span className="text-ink-2"> · {official}</span>}</span>],
          ["Since", c.onset ? `${fmtDateOnly(c.onset)} (${relativeDays(c.onset)})` : null],
          ["Resolved", c.resolvedAt ? fmtDateOnly(c.resolvedAt) : null],
        ]}
      />
      {c.comment && <HoverText>{c.comment}</HoverText>}
    </>
  );
}

const ALLERGY_TYPE = { drug: "Drug allergy", food: "Food allergy", environment: "Environmental allergy", other: "Allergy" } as const;

export function AllergyCard({ a }: { a: Pick<AllergyIntolerance, "substance" | "type" | "reaction" | "severity" | "verified" | "recordedAt"> }) {
  return (
    <>
      <HoverTitle tone="crit" sub={ALLERGY_TYPE[a.type]}>{a.substance}</HoverTitle>
      <HoverRows
        rows={[
          ["Reaction", a.reaction ?? "Not recorded"],
          ["Severity", <span key="s" className={`capitalize ${a.severity === "severe" ? "font-semibold text-crit" : ""}`}>{a.severity}</span>],
          ["Verified", a.verified ? "Yes" : "No, reported only"],
          ["Recorded", fmtDate(a.recordedAt)],
        ]}
      />
    </>
  );
}

const TAKING = { taking: "Taking as prescribed", not_taking: "Not taking", taking_differently: "Taking differently" } as const;
const HOW_SENT = { e_prescribe: "Sent electronically", print: "Printed", phone: "Phoned in", historical: "Outside medication (not prescribed here)" } as const;

export function MedCard({
  m,
}: {
  m: MedicationRequest & { prescriber?: Pick<Practitioner, "name" | "credentials"> | null; condition?: Pick<Condition, "display"> | null };
}) {
  const sig = sigText({ dose: m.dose, route: m.route, frequency: m.frequency, prn: m.prn, prnReason: m.prnReason, steps: m.steps });
  const status = { active: "Active", on_hold: "On hold", discontinued: "Discontinued", completed: "Completed", replaced: "Replaced by a newer prescription" }[m.status];
  return (
    <>
      <HoverTitle sub={`${status} · ${HOW_SENT[m.rxClass]}`} tone={m.status === "on_hold" ? "warn" : undefined}>
        {m.drug}
      </HoverTitle>
      <HoverRows
        rows={[
          ["Sig", sig],
          ["For", m.condition?.display ?? m.indication],
          ["Started", fmtDateOnly(m.start)],
          ["Doses from", m.courseStart ? fmtDateOnly(m.courseStart) : null],
          ["Ends", m.end ? fmtDateOnly(m.end) : null],
          ["Written", `${fmtDate(m.authoredAt)}${m.prescriber ? ` by ${person(m.prescriber)}` : ""}`],
          ["Quantity", m.quantity ? `${m.quantity}${m.daysSupply ? ` (${m.daysSupply} days)` : ""}` : null],
          ["Refills", m.rxClass === "historical" ? null : String(m.refills)],
          ["Patient says", m.taking ? `${TAKING[m.taking]}${m.takingNote ? `: ${m.takingNote}` : ""}` : null],
          ["Ended", m.endReason ? m.endReason : null],
        ]}
      />
      {m.patientInstructions && <HoverText>{m.patientInstructions}</HoverText>}
    </>
  );
}

// One result value: what it was, how it compares with the range, when, and from which report.
export function ResultCard({
  o,
  report,
  previous,
  imported,
  note,
}: {
  o: Pick<Observation, "display" | "valueNum" | "valueText" | "unit" | "refLow" | "refHigh" | "refText" | "flag" | "effectiveAt" | "code" | "correctedAt">;
  report?: Pick<DiagnosticReport, "display"> | null;
  previous?: Pick<Observation, "valueNum" | "valueText" | "effectiveAt"> | null;
  imported?: boolean;
  note?: React.ReactNode;
}) {
  const flagged = o.flag && o.flag !== "N";
  const tone = o.flag === "LL" || o.flag === "HH" ? "crit" : o.flag === "L" ? "low" : flagged ? "high" : undefined;
  const change = previous && previous.valueNum !== null && o.valueNum !== null ? o.valueNum - previous.valueNum : null;
  return (
    <>
      <HoverTitle sub={fmtDateTime(o.effectiveAt)}>{o.display}</HoverTitle>
      <div className="px-3 pt-2">
        <span className={`tabular text-[15px] font-semibold ${tone === "crit" ? "text-crit" : tone === "low" ? "text-low" : tone === "high" ? "text-high" : ""}`}>
          {fmtValue(o) || "—"}
        </span>
        {o.unit && <span className="ml-1 text-ink-3">{unitLabel(o.unit)}</span>}
        <span className={`ml-2 text-[12px] font-medium ${tone ? "" : "text-ok"}`}>{o.flag ? flagTitle(o.flag) : ""}</span>
      </div>
      <HoverRows
        rows={[
          ["Range", fmtRange(o) || "None given"],
          [
            "Before",
            previous
              ? `${fmtValue(previous)} on ${fmtDate(previous.effectiveAt)}${change !== null && change !== 0 ? ` (${change > 0 ? "up" : "down"} ${Math.abs(Math.round(change * 100) / 100)})` : ""}`
              : null,
          ],
          ["Report", report?.display],
          ["Source", imported ? "Imported from an outside report" : null],
          ["Corrected", o.correctedAt ? fmtDateTime(o.correctedAt) : null],
          ["Code", <span key="c" className="font-mono text-ink-3">{o.code}</span>],
        ]}
      />
      {note && <HoverText muted>{note}</HoverText>}
    </>
  );
}

const NOTE_TYPE = { progress: "Progress note", history_physical: "History and physical", consult: "Consult", procedure: "Procedure note", phone: "Telephone encounter" } as const;

// Signed, pended or waiting for a cosign, by whom, and the opening lines.
export function NoteCard({
  n,
}: {
  n: Pick<Note, "title" | "type" | "status" | "serviceAt" | "signedAt" | "editedAt" | "body"> & { author: Pick<Practitioner, "name" | "credentials">; cosigner?: Pick<Practitioner, "name" | "credentials"> | null };
}) {
  const status = n.status === "draft" ? "Pended, not signed" : n.status === "pending_cosign" ? `Waiting for a cosign${n.cosigner ? ` from ${person(n.cosigner)}` : ""}` : `Signed ${n.signedAt ? fmtDateTime(n.signedAt) : ""}`;
  const preview = n.body.replace(/\*\*\*/g, "").replace(/\s+/g, " ").trim().slice(0, 320);
  return (
    <>
      <HoverTitle sub={`${NOTE_TYPE[n.type]} · ${fmtDate(n.serviceAt)}`}>{n.title}</HoverTitle>
      <HoverRows
        rows={[
          ["Author", person(n.author)],
          ["Status", <span key="s" className={n.status === "draft" ? "text-warn" : n.status === "pending_cosign" ? "text-low" : ""}>{status}</span>],
          ["Edited", n.editedAt ? fmtDateTime(n.editedAt) : null],
        ]}
      />
      {preview && <HoverText muted>{preview}{n.body.length > 320 ? "…" : ""}</HoverText>}
    </>
  );
}

const ORDER_TYPE = { lab: "Lab", imaging: "Imaging", medication: "Medication", referral: "Referral", procedure: "Procedure" } as const;

export function OrderCard({
  o,
}: {
  o: ServiceRequest & { orderedBy?: Pick<Practitioner, "name" | "credentials"> | null; condition?: Pick<Condition, "display"> | null };
}) {
  const status = { pending: "Not signed yet", signed: "Signed, waiting to be done", completed: "Done", discontinued: "Discontinued" }[o.status];
  return (
    <>
      <HoverTitle sub={`${ORDER_TYPE[o.type]} order · ${o.priority === "routine" ? "Routine" : o.priority.toUpperCase()}`}>{o.display}</HoverTitle>
      <HoverRows
        rows={[
          ["Status", status],
          ["For", o.condition?.display ?? o.indication],
          ["Ordered", `${fmtDate(o.createdAt)}${o.orderedBy ? ` by ${person(o.orderedBy)}` : ""}`],
          ["Signed", o.signedAt ? fmtDateTime(o.signedAt) : null],
          ["Due", o.expectedAt ? fmtDateOnly(o.expectedAt) : null],
          ["Expires", o.expiresAt ? fmtDateOnly(o.expiresAt) : null],
          ["Done", o.completedAt ? fmtDateTime(o.completedAt) : null],
          ["Order set", o.orderSet],
          ["Code", <span key="c" className="font-mono text-ink-3">{o.code}</span>],
        ]}
      />
      {o.instructions && <HoverText>{o.instructions}</HoverText>}
    </>
  );
}

export function VisitCard({ e }: { e: Pick<Encounter, "start" | "reason" | "chiefComplaint" | "visitType" | "type" | "status" | "room" | "bookingNote"> & { provider?: Pick<Practitioner, "name" | "credentials"> | null } }) {
  return (
    <>
      <HoverTitle sub={fmtDateTime(e.start)}>{e.chiefComplaint ?? e.reason ?? "Visit"}</HoverTitle>
      <HoverRows
        rows={[
          ["With", person(e.provider)],
          ["Kind", `${e.visitType.replace(/_/g, " ")}${e.type === "telehealth" ? ", video" : ""}`],
          ["Status", e.status.replace(/_/g, " ")],
          ["Room", e.room],
          ["Note", e.bookingNote],
        ]}
      />
    </>
  );
}

