"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ClinicalDocType } from "@prisma/client";
import { discardImport, rereadAs } from "@/app/patients/[id]/import/actions";
import { fileDocument, saveDocDraft } from "@/app/patients/[id]/import/document-actions";
import {
  assessDocDraft,
  DIAGNOSIS_KINDS,
  DOC_TYPES,
  docTypeLabel,
  MED_CHANGES,
  orderChoices,
  type ChartFacts,
  type DocDiagnosis,
  type DocDraft,
  type DocFollowUp,
  type DocMed,
  type DocSection,
  type DocMeasurement,
  type ProblemMatch,
} from "@/lib/documents/draft";
import type { PatientFacts } from "@/lib/labs/draft";
import { fmtDate } from "@/lib/format";
import { Button, inputCls } from "@/components/form";
import { IdentityCard } from "@/components/import/review-editor";
import { PageViewer, type PageDoc, type PageMark } from "@/components/import/page-viewer";
import { ChangeChip } from "./doc-view";

type ListKey = "sections" | "measurements" | "diagnoses" | "meds" | "followUps";

const DATE_LABEL: Record<ClinicalDocType, string> = {
  imaging_report: "Exam date",
  discharge_summary: "Discharge date",
  referral_letter: "Letter date",
  consult_note: "Visit date",
  procedure_note: "Procedure date",
  pathology_report: "Collected",
  other: "Document date",
};

export function DocReviewEditor({
  patientId,
  jobId,
  readOnly,
  canFile,
  initialDraft,
  docs,
  patient,
  chart,
}: {
  patientId: string;
  jobId: string;
  readOnly: boolean;
  // Nurses prepare the review; a physician or resident verifies and files it.
  canFile: boolean;
  initialDraft: DocDraft;
  docs: PageDoc[];
  patient: PatientFacts;
  chart: ChartFacts;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [selected, setSelected] = useState<string | null>(null);
  const [file, setFile] = useState(0);
  const [saveState, setSaveState] = useState<"saved" | "pending" | "error">("saved");
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const first = useRef(true);

  const a = useMemo(() => assessDocDraft(draft, patient, chart), [draft, patient, chart]);
  const orders = orderChoices(draft.type, chart.orders);

  // Autosave the working copy so a reload or a colleague sees the same edits.
  useEffect(() => {
    if (readOnly) return;
    if (first.current) {
      first.current = false;
      return;
    }
    setSaveState("pending");
    const t = setTimeout(() => {
      saveDocDraft(patientId, jobId, JSON.stringify(draft)).then(
        () => setSaveState("saved"),
        () => setSaveState("error"),
      );
    }, 1000);
    return () => clearTimeout(t);
  }, [draft, patientId, jobId, readOnly]);

  const set = (patch: Partial<DocDraft>) => setDraft((d) => ({ ...d, ...patch }));
  function setItem<K extends ListKey>(key: K, id: string, patch: Partial<DocDraft[K][number]>) {
    setDraft((d) => ({ ...d, [key]: (d[key] as { id: string }[]).map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  }
  function removeItem(key: ListKey, id: string) {
    setDraft((d) => ({ ...d, [key]: (d[key] as { id: string }[]).filter((x) => x.id !== id) }));
  }
  function addItem(key: ListKey) {
    const id = `${key[0]}${Date.now().toString(36)}`;
    const src = { file, box: null };
    const blank = {
      sections: { id, heading: "", text: "", ...src },
      measurements: { id, name: "", value: "", unit: "", range: "", group: "", ...src },
      diagnoses: { id, text: "", kind: "secondary", icd10: "", addToProblems: false, ...src },
      meds: { id, text: "", drug: "", dose: "", route: "", frequency: "", change: "unknown", addToList: false, ...src },
      followUps: { id, text: "", due: "", ...src },
    }[key];
    setDraft((d) => ({ ...d, [key]: [...d[key], blank] }));
    setSelected(id);
  }

  const all = [...draft.sections, ...draft.measurements, ...draft.diagnoses, ...draft.meds, ...draft.followUps];
  function select(id: string) {
    setSelected(id);
    const item = all.find((x) => x.id === id);
    if (item && item.file !== file && docs[item.file]) setFile(item.file);
  }

  const marks: PageMark[] = [
    ...draft.sections.map((s) => ({ id: s.id, file: s.file, box: s.box, label: s.heading || "Text", tone: "border-ink-3/40" })),
    ...draft.measurements.map((m) => ({ id: m.id, file: m.file, box: m.box, label: m.name, tone: "border-accent/60" })),
    ...draft.diagnoses.map((d) => ({ id: d.id, file: d.file, box: d.box, label: d.text, tone: "border-high/60" })),
    ...draft.meds.map((m) => ({ id: m.id, file: m.file, box: m.box, label: m.text || m.drug, tone: "border-low/60" })),
    ...draft.followUps.map((f) => ({ id: f.id, file: f.file, box: f.box, label: f.text, tone: "border-warn/70" })),
  ];

  const addProblems = draft.diagnoses.filter((d) => d.addToProblems);
  const addMeds = draft.meds.filter((m) => m.addToList);
  const order = orders.find((o) => o.id === draft.orderId);
  const effects = [
    addProblems.length && `${addProblems.length} to the problem list`,
    addMeds.length && `${addMeds.length} outside ${addMeds.length === 1 ? "medication" : "medications"}`,
    order && `completes ${order.display}`,
  ].filter(Boolean);

  function file_() {
    const lines = [
      `File this ${docTypeLabel[draft.type].toLowerCase()} to ${patient.lastName}, ${patient.firstName}'s chart?`,
      ...addProblems.map((d) => `• Add problem: ${d.text}${d.icd10 ? ` (${d.icd10})` : ""}`),
      ...addMeds.map((m) => `• Add outside medication: ${m.drug}`),
      ...(order ? [`• Complete order: ${order.display}`] : []),
      "",
      "By filing you confirm you checked it against the original pages.",
    ];
    if (!confirm(lines.join("\n"))) return;
    setErrors([]);
    start(async () => {
      const res = await fileDocument(patientId, jobId, JSON.stringify(draft));
      if (res?.errors) setErrors(res.errors);
    });
  }

  const blockers = [...a.blockers, ...errors];

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <PageViewer docs={docs} file={file} setFile={setFile} marks={marks} selected={selected} onSelect={select} />

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto border-l border-line">
        {!readOnly && (
          <div className="sticky top-0 z-10 border-b border-line bg-panel px-4 py-2 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {docTypeLabel[draft.type]}
                  {draft.title && draft.title.toLowerCase() !== docTypeLabel[draft.type].toLowerCase() && <span className="font-normal text-ink-2"> · {draft.title}</span>}
                </div>
                <div className="truncate text-[12px] text-ink-3">{effects.length ? `On filing: ${effects.join(" · ")}` : "Files to Documents. Nothing is added to the problem or medication lists."}</div>
              </div>
              <span className="text-[11.5px] text-ink-3">{saveState === "pending" ? "Saving…" : saveState === "error" ? "Couldn't save draft" : "Draft saved"}</span>
              <Button
                variant="danger"
                disabled={pending}
                onClick={() => {
                  if (confirm("Discard this import? Nothing from it will be filed.")) start(() => discardImport(patientId, jobId));
                }}
              >
                Discard
              </Button>
              {canFile ? (
                <Button onClick={file_} disabled={pending || a.blockers.length > 0} className="px-4 disabled:cursor-not-allowed disabled:opacity-50">
                  {pending ? "Filing…" : "Verify & file"}
                </Button>
              ) : (
                <span className="rounded bg-panel-muted px-2 py-1 text-[12px] text-ink-2">Ready for a physician or resident to verify and file</span>
              )}
            </div>
            {blockers.length > 0 && (
              <ul className="mt-1.5 flex flex-wrap gap-x-4 text-[12px] text-crit">
                {blockers.map((b) => (
                  <li key={b}>• {b}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="space-y-3 p-4">
          {draft.detectedType === "lab_report" && !readOnly && (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-accent/30 bg-accent-soft px-3 py-2 text-[12.5px]">
              <span className="flex-1">This looks like a lab report. Reading it as lab results files each value into the Results table with flags and trends.</span>
              <Button disabled={pending} onClick={() => start(() => rereadAs(patientId, jobId, "lab"))}>
                Read as lab results
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 min-[1800px]:grid-cols-2">
            <IdentityCard draft={draft} set={set} patient={patient} identity={a.identity} readOnly={readOnly} noun="document" />
            <Card title="Document">
              <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">
                <Labeled label="Type">
                  <select
                    className={`${inputCls} w-full`}
                    value={draft.type}
                    disabled={readOnly}
                    onChange={(e) => {
                      const type = e.target.value as ClinicalDocType;
                      set({ type, orderId: orderChoices(type, chart.orders).some((o) => o.id === draft.orderId) ? draft.orderId : null });
                    }}
                  >
                    {DOC_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Labeled>
                <Labeled label={`${DATE_LABEL[draft.type]} *`}>
                  <input
                    type="date"
                    className={`${inputCls} w-full ${draft.serviceDate ? "" : "border-crit/60"}`}
                    value={draft.serviceDate}
                    disabled={readOnly}
                    onChange={(e) => set({ serviceDate: e.target.value })}
                  />
                </Labeled>
                <Labeled label="Title *" wide>
                  <input className={`${inputCls} w-full ${draft.title.trim() ? "" : "border-crit/60"}`} value={draft.title} disabled={readOnly} onChange={(e) => set({ title: e.target.value })} />
                </Labeled>
                <Labeled label="From (facility or practice)">
                  <input className={`${inputCls} w-full`} value={draft.organization} disabled={readOnly} onChange={(e) => set({ organization: e.target.value })} />
                </Labeled>
                <Labeled label="Author">
                  <input className={`${inputCls} w-full`} value={draft.author} disabled={readOnly} onChange={(e) => set({ author: e.target.value })} />
                </Labeled>
                {draft.type === "discharge_summary" && (
                  <>
                    <Labeled label="Admitted">
                      <input type="date" className={`${inputCls} w-full`} value={draft.admitDate} disabled={readOnly} onChange={(e) => set({ admitDate: e.target.value })} />
                    </Labeled>
                    <Labeled label="Discharged">
                      <input type="date" className={`${inputCls} w-full`} value={draft.dischargeDate} disabled={readOnly} onChange={(e) => set({ dischargeDate: e.target.value })} />
                    </Labeled>
                  </>
                )}
                {draft.type === "imaging_report" && (
                  <>
                    <Labeled label="Modality">
                      <input className={`${inputCls} w-full`} value={draft.modality} disabled={readOnly} onChange={(e) => set({ modality: e.target.value })} placeholder="CT, MRI, X-ray…" />
                    </Labeled>
                    <Labeled label="Body part">
                      <input className={`${inputCls} w-full`} value={draft.bodyPart} disabled={readOnly} onChange={(e) => set({ bodyPart: e.target.value })} />
                    </Labeled>
                  </>
                )}
                {orders.length > 0 && (
                  <Labeled label="Answers order" wide>
                    <select className={`${inputCls} w-full`} value={draft.orderId ?? ""} disabled={readOnly} onChange={(e) => set({ orderId: e.target.value || null })}>
                      <option value="">None</option>
                      {orders.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.display} · signed {fmtDate(new Date(o.signedAt))}
                        </option>
                      ))}
                    </select>
                  </Labeled>
                )}
              </div>
            </Card>
          </div>

          {draft.notes.length > 0 && (
            <div className="rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-[12.5px]">
              <div className="mb-0.5 font-semibold text-warn">Notes from reading the document</div>
              <ul className="list-disc pl-5 text-ink-2">
                {draft.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          <Card title={draft.type === "imaging_report" ? "Impression" : "Impression / assessment"}>
            <div className="p-3">
              <AutoText value={draft.impression} disabled={readOnly} onChange={(v) => set({ impression: v })} className="font-medium" placeholder="The conclusion as printed, if the document has one." />
            </div>
          </Card>

          {(draft.measurements.length > 0 || (!readOnly && draft.type === "imaging_report")) && (
            <Card
              title="Measurements"
              count={draft.measurements.length}
              hint="As printed, e.g. echo EF and chamber sizes."
              footer={!readOnly && <AddButton onClick={() => addItem("measurements")}>Add a measurement</AddButton>}
            >
              {draft.measurements.length === 0 ? (
                <p className="px-3 py-3 text-ink-3">None printed in the report.</p>
              ) : (
                <ul>
                  {draft.measurements.map((m) => (
                    <MeasurementRow key={m.id} m={m} selected={selected === m.id} onSelect={() => select(m.id)} set={(p) => setItem("measurements", m.id, p)} remove={() => removeItem("measurements", m.id)} readOnly={readOnly} />
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card
            title="Diagnoses and findings"
            count={draft.diagnoses.length}
            hint="Tick one to add it to the problem list when filed."
            footer={!readOnly && <AddButton onClick={() => addItem("diagnoses")}>Add a diagnosis</AddButton>}
          >
            {draft.diagnoses.length === 0 ? (
              <p className="px-3 py-3 text-ink-3">None listed in the document.</p>
            ) : (
              <ul>
                {draft.diagnoses.map((d) => (
                  <DiagnosisRow
                    key={d.id}
                    d={d}
                    match={a.problems.get(d.id) ?? null}
                    selected={selected === d.id}
                    onSelect={() => select(d.id)}
                    set={(p) => setItem("diagnoses", d.id, p)}
                    remove={() => removeItem("diagnoses", d.id)}
                    readOnly={readOnly}
                  />
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Medications"
            count={draft.meds.length}
            hint="Compared with the medication list. Tick one to add it as an outside medication; nothing is prescribed."
            footer={!readOnly && <AddButton onClick={() => addItem("meds")}>Add a medication</AddButton>}
          >
            {draft.meds.length === 0 ? (
              <p className="px-3 py-3 text-ink-3">None listed in the document.</p>
            ) : (
              <ul>
                {draft.meds.map((m) => (
                  <MedRow
                    key={m.id}
                    m={m}
                    onList={a.meds.get(m.id) ?? null}
                    note={a.medNotes.get(m.id)}
                    selected={selected === m.id}
                    onSelect={() => select(m.id)}
                    set={(p) => setItem("meds", m.id, p)}
                    remove={() => removeItem("meds", m.id)}
                    readOnly={readOnly}
                  />
                ))}
              </ul>
            )}
          </Card>

          <Card title="Follow-up and recommendations" count={draft.followUps.length} footer={!readOnly && <AddButton onClick={() => addItem("followUps")}>Add a follow-up</AddButton>}>
            {draft.followUps.length === 0 ? (
              <p className="px-3 py-3 text-ink-3">None in the document.</p>
            ) : (
              <ul>
                {draft.followUps.map((f) => (
                  <FollowUpRow key={f.id} f={f} selected={selected === f.id} onSelect={() => select(f.id)} set={(p) => setItem("followUps", f.id, p)} remove={() => removeItem("followUps", f.id)} readOnly={readOnly} />
                ))}
              </ul>
            )}
          </Card>

          <Card title="Full text" count={draft.sections.length} hint="Word for word, as printed." footer={!readOnly && <AddButton onClick={() => addItem("sections")}>Add a section</AddButton>}>
            <ul>
              {draft.sections.map((s) => (
                <SectionRow key={s.id} s={s} selected={selected === s.id} onSelect={() => select(s.id)} set={(p) => setItem("sections", s.id, p)} remove={() => removeItem("sections", s.id)} readOnly={readOnly} />
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---------- rows ----------

function useScrollIntoView(selected: boolean) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);
  return ref;
}

const rowBg = (selected: boolean) => (selected ? "bg-accent-soft/70" : "");

function DiagnosisRow({
  d,
  match,
  selected,
  onSelect,
  set,
  remove,
  readOnly,
}: {
  d: DocDiagnosis;
  match: ProblemMatch;
  selected: boolean;
  onSelect: () => void;
  set: (p: Partial<DocDiagnosis>) => void;
  remove: () => void;
  readOnly: boolean;
}) {
  const ref = useScrollIntoView(selected);
  const same = match?.kind === "same";
  return (
    <li ref={ref} onClick={onSelect} className={`cursor-pointer border-t border-line px-3 py-1.5 first:border-t-0 ${rowBg(selected)}`}>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={d.addToProblems}
          disabled={readOnly || (same && !d.addToProblems)}
          onChange={(e) => set({ addToProblems: e.target.checked })}
          onClick={(e) => e.stopPropagation()}
          title="Add to the problem list"
          aria-label={`Add ${d.text} to problem list`}
        />
        <input className={`${inputCls} min-w-0 flex-1 py-0.5 font-medium`} value={d.text} disabled={readOnly} onChange={(e) => set({ text: e.target.value })} placeholder="Diagnosis" />
        <select className={`${inputCls} w-36 py-0.5`} value={d.kind} disabled={readOnly} onChange={(e) => set({ kind: e.target.value as DocDiagnosis["kind"] })} onClick={(e) => e.stopPropagation()}>
          {Object.entries(DIAGNOSIS_KINDS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <input
          className={`${inputCls} w-24 py-0.5 font-mono text-[12px] uppercase`}
          value={d.icd10}
          disabled={readOnly}
          onChange={(e) => set({ icd10: e.target.value.toUpperCase() })}
          placeholder="ICD-10"
          aria-label="ICD-10 code"
        />
        {!readOnly && <RemoveButton onClick={remove} />}
      </div>
      <div className="mt-0.5 pl-6 text-[11.5px]">
        {!match ? (
          <span className="text-ink-3">Not on the problem list</span>
        ) : same ? (
          <span className="text-ok">✓ On the problem list</span>
        ) : (
          <span className="text-warn">
            ▲ Related problem on the list: {match.display} ({match.code}). Adding keeps both.
          </span>
        )}
        {d.addToProblems && <span className="ml-2 font-semibold text-accent">Will be added{d.icd10 ? "" : " with no code (R69)"}</span>}
      </div>
    </li>
  );
}

function MedRow({
  m,
  onList,
  note,
  selected,
  onSelect,
  set,
  remove,
  readOnly,
}: {
  m: DocMed;
  onList: string | null;
  note?: string;
  selected: boolean;
  onSelect: () => void;
  set: (p: Partial<DocMed>) => void;
  remove: () => void;
  readOnly: boolean;
}) {
  const ref = useScrollIntoView(selected);
  const canAdd = !onList && m.change !== "stopped";
  return (
    <li ref={ref} onClick={onSelect} className={`cursor-pointer border-t border-line px-3 py-1.5 first:border-t-0 ${rowBg(selected)}`}>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={m.addToList}
          disabled={readOnly || (!canAdd && !m.addToList)}
          onChange={(e) => set({ addToList: e.target.checked })}
          onClick={(e) => e.stopPropagation()}
          title="Add as an outside medication"
          aria-label={`Add ${m.drug} to medication list`}
        />
        <input className={`${inputCls} min-w-0 flex-1 py-0.5 font-medium`} value={m.drug} disabled={readOnly} onChange={(e) => set({ drug: e.target.value })} placeholder="Drug and strength" />
        <input className={`${inputCls} w-24 py-0.5`} value={m.dose} disabled={readOnly} onChange={(e) => set({ dose: e.target.value })} placeholder="Dose" aria-label="Dose" />
        <input className={`${inputCls} w-36 py-0.5`} value={m.frequency} disabled={readOnly} onChange={(e) => set({ frequency: e.target.value })} placeholder="How often" aria-label="How often" />
        {readOnly ? (
          <ChangeChip change={m.change} />
        ) : (
          <select className={`${inputCls} w-28 py-0.5`} value={m.change} onChange={(e) => set({ change: e.target.value as DocMed["change"] })} onClick={(e) => e.stopPropagation()} aria-label="In the document">
            {Object.entries(MED_CHANGES).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        )}
        {!readOnly && <RemoveButton onClick={remove} />}
      </div>
      <div className="mt-0.5 space-y-0.5 pl-6 text-[11.5px]">
        <div className="flex flex-wrap gap-x-3">
          {onList ? <span className="text-ok">✓ On the list as {onList}</span> : <span className="text-ink-3">Not on the medication list</span>}
          {m.addToList && <span className="font-semibold text-accent">Will be added as an outside medication</span>}
          {m.text && m.text !== m.drug && <span className="truncate text-ink-3">As printed: {m.text}</span>}
        </div>
        {note && <div className="text-warn">▲ {note}</div>}
      </div>
    </li>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="px-1 text-ink-3 hover:text-crit"
      title="Remove"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      ✕
    </button>
  );
}

function FollowUpRow({ f, selected, onSelect, set, remove, readOnly }: { f: DocFollowUp; selected: boolean; onSelect: () => void; set: (p: Partial<DocFollowUp>) => void; remove: () => void; readOnly: boolean }) {
  const ref = useScrollIntoView(selected);
  return (
    <li ref={ref} onClick={onSelect} className={`flex cursor-pointer items-start gap-2 border-t border-line px-3 py-1.5 first:border-t-0 ${rowBg(selected)}`}>
      <AutoText value={f.text} disabled={readOnly} onChange={(v) => set({ text: v })} className="flex-1" placeholder="Recommendation" />
      <input className={`${inputCls} w-36 py-0.5`} value={f.due} disabled={readOnly} onChange={(e) => set({ due: e.target.value })} placeholder="When" aria-label="When" />
      {!readOnly && (
        <button className="pt-1 text-ink-3 hover:text-crit" title="Remove" onClick={remove}>
          ✕
        </button>
      )}
    </li>
  );
}

function MeasurementRow({ m, selected, onSelect, set, remove, readOnly }: { m: DocMeasurement; selected: boolean; onSelect: () => void; set: (p: Partial<DocMeasurement>) => void; remove: () => void; readOnly: boolean }) {
  const ref = useScrollIntoView(selected);
  return (
    <li ref={ref} onClick={onSelect} className={`flex cursor-pointer flex-wrap items-center gap-2 border-t border-line px-3 py-1.5 first:border-t-0 ${rowBg(selected)}`}>
      <input className={`${inputCls} min-w-32 flex-1 py-0.5`} value={m.name} disabled={readOnly} onChange={(e) => set({ name: e.target.value })} placeholder="Measurement" aria-label="Measurement" />
      <input className={`${inputCls} w-20 py-0.5 text-right font-medium tabular-nums`} value={m.value} disabled={readOnly} onChange={(e) => set({ value: e.target.value })} placeholder="Value" aria-label="Value" />
      <input className={`${inputCls} w-20 py-0.5`} value={m.unit} disabled={readOnly} onChange={(e) => set({ unit: e.target.value })} placeholder="Unit" aria-label="Unit" />
      <input className={`${inputCls} w-28 py-0.5 text-ink-2`} value={m.range} disabled={readOnly} onChange={(e) => set({ range: e.target.value })} placeholder="Normal range" aria-label="Normal range" />
      {m.group && <span className="text-[11px] text-ink-3">{m.group}</span>}
      {!readOnly && (
        <button className="text-ink-3 hover:text-crit" title="Remove" onClick={remove}>
          ✕
        </button>
      )}
    </li>
  );
}

function SectionRow({ s, selected, onSelect, set, remove, readOnly }: { s: DocSection; selected: boolean; onSelect: () => void; set: (p: Partial<DocSection>) => void; remove: () => void; readOnly: boolean }) {
  const ref = useScrollIntoView(selected);
  return (
    <li ref={ref} onClick={onSelect} className={`cursor-pointer space-y-1 border-t border-line px-3 py-2 first:border-t-0 ${rowBg(selected)}`}>
      <div className="flex items-center gap-2">
        <input
          className={`${inputCls} flex-1 py-0.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-2`}
          value={s.heading}
          disabled={readOnly}
          onChange={(e) => set({ heading: e.target.value })}
          placeholder="Heading"
        />
        <span className="text-[11px] text-ink-3">page {s.file + 1}</span>
        {!readOnly && (
          <button className="text-ink-3 hover:text-crit" title="Remove section" onClick={remove}>
            ✕
          </button>
        )}
      </div>
      <AutoText value={s.text} disabled={readOnly} onChange={(v) => set({ text: v })} />
    </li>
  );
}

// ---------- bits ----------

function AutoText({ value, onChange, disabled, className = "", placeholder }: { value: string; onChange: (v: string) => void; disabled: boolean; className?: string; placeholder?: string }) {
  const rows = Math.max(1, value.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 95)), 0));
  return (
    <textarea
      className={`${inputCls} block w-full resize-y py-1 leading-snug ${className}`}
      rows={Math.min(rows, 14)}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Card({ title, count, hint, footer, children }: { title: string; count?: number; hint?: string; footer?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-x-auto rounded-md border border-line bg-panel">
      <header className="flex items-baseline gap-2 border-b border-line px-3 py-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">
          {title}
          {count !== undefined && <span className="ml-1 font-normal text-ink-3">({count})</span>}
        </h2>
        {hint && <span className="text-[11.5px] text-ink-3">{hint}</span>}
      </header>
      {children}
      {footer && <div className="border-t border-line px-3 py-1.5">{footer}</div>}
    </section>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Button variant="ghost" onClick={onClick}>
      + {children}
    </Button>
  );
}

function Labeled({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex min-w-0 flex-col gap-0.5 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-[11px] font-medium text-ink-3">{label}</span>
      {children}
    </label>
  );
}
