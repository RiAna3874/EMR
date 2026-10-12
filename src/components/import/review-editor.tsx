"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { Flag } from "@prisma/client";
import { discardImport, fileImport, saveDraft } from "@/app/patients/[id]/import/actions";
import { ANALYTES, PANELS } from "@/lib/labs/catalog";
import {
  assessDraft,
  blankRow,
  panelFor,
  parseRange,
  type Draft,
  type DraftRow,
  type History,
  type Issue,
  type PatientFacts,
  type RowAssessment,
} from "@/lib/labs/draft";
import { roundConverted } from "@/lib/labs/units";
import { fmtDob, unitLabel } from "@/lib/format";
import { FlagBadge, flagText } from "@/components/flag";
import { Button, inputCls } from "@/components/form";

type Doc = { id: string; url: string; mimeType: string; fileName: string; width: number | null; height: number | null };

export function ReviewEditor({
  patientId,
  jobId,
  readOnly,
  initialDraft,
  docs,
  patient,
  history,
}: {
  patientId: string;
  jobId: string;
  readOnly: boolean;
  initialDraft: Draft;
  docs: Doc[];
  patient: PatientFacts;
  history: History;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [selected, setSelected] = useState<string | null>(null);
  const [file, setFile] = useState(0);
  const [saveState, setSaveState] = useState<"saved" | "pending" | "error">("saved");
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const first = useRef(true);

  const assessment = useMemo(() => assessDraft(draft, patient, history), [draft, patient, history]);
  const included = draft.rows.filter((r) => r.include);

  // Autosave the working copy so a reload or a colleague sees the same edits.
  useEffect(() => {
    if (readOnly) return;
    if (first.current) {
      first.current = false;
      return;
    }
    setSaveState("pending");
    const t = setTimeout(() => {
      saveDraft(patientId, jobId, JSON.stringify(draft)).then(
        () => setSaveState("saved"),
        () => setSaveState("error"),
      );
    }, 1000);
    return () => clearTimeout(t);
  }, [draft, patientId, jobId, readOnly]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setRow = (id: string, patch: Partial<DraftRow>) => setDraft((d) => ({ ...d, rows: d.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));

  function select(id: string) {
    setSelected(id);
    const row = draft.rows.find((r) => r.id === id);
    if (row && row.file !== file && docs[row.file]) setFile(row.file);
  }

  function addRow() {
    const id = `m${Date.now().toString(36)}`;
    setDraft((d) => ({ ...d, rows: [...d.rows, blankRow(id, file)] }));
    setSelected(id);
  }

  function file_() {
    const flagged = included.filter((r) => {
      const f = assessment.rows.get(r.id)?.flag;
      return f && f !== "N";
    }).length;
    const ok = confirm(
      `File ${included.length} result${included.length === 1 ? "" : "s"} (${flagged} abnormal) to ${patient.lastName}, ${patient.firstName}'s chart?\n\nBy filing you confirm you checked each value against the original report.`,
    );
    if (!ok) return;
    setErrors([]);
    start(async () => {
      const res = await fileImport(patientId, jobId, JSON.stringify(draft));
      if (res?.errors) setErrors(res.errors);
    });
  }

  const blockers = [...assessment.blockers, ...errors];
  const sections = groupBySection(draft.rows);
  const destinations = summarizeDestinations(draft.rows, assessment.rows);
  const abnormal = included.filter((r) => {
    const f = assessment.rows.get(r.id)?.flag;
    return f && f !== "N";
  }).length;
  const critical = included.filter((r) => ["LL", "HH"].includes(assessment.rows.get(r.id)?.flag ?? "")).length;
  const warnings = included.reduce((n, r) => n + (assessment.rows.get(r.id)?.issues.filter((i) => i.severity === "warn").length ?? 0), 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <DocViewer docs={docs} file={file} setFile={setFile} rows={draft.rows} assessments={assessment.rows} selected={selected} onSelect={select} />

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto border-l border-line">
        {!readOnly && (
          <div className="sticky top-0 z-10 border-b border-line bg-panel px-4 py-2 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {included.length} of {draft.rows.length} results selected
                  {abnormal > 0 && <span className="ml-2 text-high">{abnormal} abnormal</span>}
                  {critical > 0 && <span className="ml-2 font-bold text-crit">{critical} critical</span>}
                  {warnings > 0 && <span className="ml-2 text-warn">{warnings} to check</span>}
                </div>
                {destinations.length > 0 && <div className="truncate text-[12px] text-ink-3">Files into: {destinations.join(" · ")}</div>}
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
              <Button onClick={file_} disabled={pending || assessment.blockers.length > 0} className="px-4 disabled:cursor-not-allowed disabled:opacity-50">
                {pending ? "Filing…" : "Verify & file"}
              </Button>
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
          <div className="grid grid-cols-1 gap-3 min-[1800px]:grid-cols-2">
            <IdentityCard draft={draft} set={set} patient={patient} identity={assessment.identity} readOnly={readOnly} />
            <DetailsCard draft={draft} set={set} readOnly={readOnly} />
          </div>

          {draft.notes.length > 0 && (
            <div className="rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-[12.5px]">
              <div className="mb-0.5 font-semibold text-warn">Notes from reading the report</div>
              <ul className="list-disc pl-5 text-ink-2">
                {draft.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          <section className="overflow-x-auto rounded-md border border-line bg-panel">
            <table className="w-full min-w-[760px]">
              <thead className="bg-panel-muted text-left text-[11.5px] text-ink-3">
                <tr>
                  <th className="w-8 px-2 py-2" title="File this result">
                    File
                  </th>
                  <th className="px-2 py-2 font-medium">Test</th>
                  <th className="w-28 px-2 py-2 text-right font-medium">Value</th>
                  <th className="w-28 px-2 py-2 font-medium">Units</th>
                  <th className="w-40 px-2 py-2 font-medium">Reference range</th>
                  <th className="w-28 px-2 py-2 font-medium">Flag</th>
                </tr>
              </thead>
              {sections.map(([section, rows]) => (
                <tbody key={section}>
                  <tr className="border-t border-line bg-panel-muted/60">
                    <td colSpan={6} className="px-3 py-1 text-[11.5px] font-semibold uppercase tracking-wide text-ink-2">
                      {section || "Results"}
                    </td>
                  </tr>
                  {rows.map((row) => (
                    <ResultRow
                      key={row.id}
                      row={row}
                      a={assessment.rows.get(row.id)!}
                      selected={selected === row.id}
                      onSelect={() => select(row.id)}
                      setRow={(p) => setRow(row.id, p)}
                      onRemove={row.confidence === "manual" ? () => setDraft((d) => ({ ...d, rows: d.rows.filter((r) => r.id !== row.id) })) : undefined}
                      sex={patient.sex}
                      readOnly={readOnly}
                    />
                  ))}
                </tbody>
              ))}
            </table>
            {draft.rows.length === 0 && <p className="px-3 py-4 text-ink-3">No results yet. Add them from the report.</p>}
            {!readOnly && (
              <div className="border-t border-line px-3 py-2">
                <Button variant="ghost" onClick={addRow}>
                  + Add a result
                </Button>
              </div>
            )}
          </section>
          <Legend />
        </div>
      </div>
    </div>
  );
}

// ---------- document viewer ----------

function DocViewer({
  docs,
  file,
  setFile,
  rows,
  assessments,
  selected,
  onSelect,
}: {
  docs: Doc[];
  file: number;
  setFile: (n: number) => void;
  rows: DraftRow[];
  assessments: Map<string, RowAssessment>;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [boxes, setBoxes] = useState(true);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const doc = docs[file];

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selected, file, zoom]);

  return (
    <div className="flex min-h-[50vh] flex-col bg-[#e9edf0] lg:w-[40%] lg:min-w-[360px]">
      <div className="flex flex-wrap items-center gap-1 border-b border-line bg-panel px-2 py-1.5 text-[12px]">
        {docs.map((d, i) => (
          <button
            key={d.id}
            onClick={() => setFile(i)}
            className={`rounded px-2 py-0.5 ${i === file ? "bg-chrome text-white" : "text-ink-2 hover:bg-panel-muted"}`}
          >
            Page {i + 1}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          {doc?.mimeType.startsWith("image/") && (
            <>
              <label className="mr-2 flex items-center gap-1 text-ink-2">
                <input type="checkbox" checked={boxes} onChange={(e) => setBoxes(e.target.checked)} /> Highlights
              </label>
              {[1, 1.5, 2.5].map((z) => (
                <button key={z} onClick={() => setZoom(z)} className={`rounded px-2 py-0.5 ${zoom === z ? "bg-chrome text-white" : "text-ink-2 hover:bg-panel-muted"}`}>
                  {z === 1 ? "Fit" : `${z * 100}%`}
                </button>
              ))}
            </>
          )}
          {doc && (
            <a href={doc.url} target="_blank" rel="noreferrer" className="ml-1 rounded px-2 py-0.5 text-accent hover:bg-panel-muted">
              Open original
            </a>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {!doc ? (
          <p className="text-ink-3">No document.</p>
        ) : doc.mimeType === "application/pdf" ? (
          <iframe src={doc.url} title={doc.fileName} className="h-full min-h-[70vh] w-full rounded border border-line bg-panel" />
        ) : (
          <div className="relative mx-auto shadow-md" style={{ width: `${zoom * 100}%` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={doc.url} alt={`Report page ${file + 1}`} className="block w-full select-none" draggable={false} />
            {boxes &&
              rows
                .filter((r) => r.file === file && r.box)
                .map((r) => {
                  const b = r.box!;
                  const isSel = r.id === selected;
                  const f = assessments.get(r.id)?.flag;
                  const tone = !r.include ? "border-ink-3/30" : f === "H" || f === "HH" || f === "A" ? "border-high/60" : f === "L" || f === "LL" ? "border-low/60" : "border-accent/40";
                  return (
                    <button
                      key={r.id}
                      ref={isSel ? selectedRef : undefined}
                      onClick={() => onSelect(r.id)}
                      title={`${r.display}: ${r.value} ${r.unit}`}
                      className={`absolute rounded-sm border ${isSel ? "z-10 border-2 border-accent bg-accent/15 ring-4 ring-accent/20" : `${tone} hover:bg-accent/10`}`}
                      style={{ left: `${b.x0 * 100}%`, top: `${b.y0 * 100}%`, width: `${(b.x1 - b.x0) * 100}%`, height: `${(b.y1 - b.y0) * 100}%` }}
                    />
                  );
                })}
          </div>
        )}
      </div>
      <p className="border-t border-line bg-panel px-3 py-1 text-[11px] text-ink-3">
        Click a result to see where it was read from. Highlights are approximate; the image is the source of truth.
      </p>
    </div>
  );
}

// ---------- cards ----------

function IdentityCard({
  draft,
  set,
  patient,
  identity,
  readOnly,
}: {
  draft: Draft;
  set: (p: Partial<Draft>) => void;
  patient: PatientFacts;
  identity: ReturnType<typeof assessDraft>["identity"];
  readOnly: boolean;
}) {
  const pill =
    identity.status === "match"
      ? ["Matches chart", "bg-accent-soft text-ok"]
      : identity.status === "mismatch"
        ? ["Doesn't match chart", "bg-crit-soft text-crit"]
        : ["Couldn't check", "bg-warn-soft text-warn"];
  const dob = new Date(`${patient.dob}T00:00:00Z`);
  const rows: [string, keyof Draft, string][] = [
    ["Name", "printedName", `${patient.firstName} ${patient.lastName}`],
    ["Date of birth", "printedDob", fmtDob(dob)],
    ["Age", "printedAge", ""],
    ["Sex", "printedSex", patient.sex],
    ["ID on report", "printedId", `MRN ${patient.mrn}`],
  ];
  return (
    <section className={`rounded-md border bg-panel ${identity.status === "mismatch" && !draft.identityConfirmed ? "border-crit/50" : "border-line"}`}>
      <header className="flex items-center justify-between border-b border-line px-3 py-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Patient check</h2>
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${pill[1]}`}>{pill[0]}</span>
      </header>
      <table className="w-full text-[12.5px]">
        <thead className="text-left text-[11px] text-ink-3">
          <tr>
            <th className="px-3 pt-1.5 font-medium" />
            <th className="px-2 pt-1.5 font-medium">On report</th>
            <th className="px-2 pt-1.5 font-medium">In chart</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, key, chart]) => (
            <tr key={key}>
              <td className="px-3 py-0.5 text-ink-3">{label}</td>
              <td className="px-2 py-0.5">
                <input
                  className={`${inputCls} w-full py-0.5`}
                  type={key === "printedDob" ? "date" : "text"}
                  value={draft[key] as string}
                  disabled={readOnly}
                  onChange={(e) => set({ [key]: e.target.value })}
                />
              </td>
              <td className="px-2 py-0.5 text-ink-2">{chart}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 pb-2 pt-1 text-[12px]">
        {identity.details.map((d) => (
          <p key={d} className={identity.status === "mismatch" ? "text-crit" : "text-ink-3"}>
            {d}
          </p>
        ))}
        {identity.status === "mismatch" && (
          <label className="mt-1 flex items-start gap-2 font-medium">
            <input type="checkbox" className="mt-0.5" checked={draft.identityConfirmed} disabled={readOnly} onChange={(e) => set({ identityConfirmed: e.target.checked })} />
            I&apos;ve confirmed this report belongs to {patient.firstName} {patient.lastName} (e.g. a nickname or a different name at the outside lab).
          </label>
        )}
      </div>
    </section>
  );
}

function DetailsCard({ draft, set, readOnly }: { draft: Draft; set: (p: Partial<Draft>) => void; readOnly: boolean }) {
  return (
    <section className="rounded-md border border-line bg-panel">
      <header className="border-b border-line px-3 py-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Report details</h2>
      </header>
      <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">
        <Labeled label="Performing lab">
          <input className={`${inputCls} w-full`} value={draft.labName} disabled={readOnly} onChange={(e) => set({ labName: e.target.value })} placeholder="Outside laboratory" />
        </Labeled>
        <Labeled label="Report title">
          <input className={`${inputCls} w-full`} value={draft.reportTitle} disabled={readOnly} onChange={(e) => set({ reportTitle: e.target.value })} />
        </Labeled>
        <Labeled label="Collected *">
          <div className="flex gap-1">
            <input
              type="date"
              className={`${inputCls} min-w-0 flex-1 ${draft.collectedDate ? "" : "border-crit/60"}`}
              value={draft.collectedDate}
              disabled={readOnly}
              onChange={(e) => set({ collectedDate: e.target.value })}
            />
            <input type="time" className={`${inputCls} w-24`} value={draft.collectedTime} disabled={readOnly} onChange={(e) => set({ collectedTime: e.target.value })} />
          </div>
        </Labeled>
        <Labeled label="Reported">
          <div className="flex gap-1">
            <input type="date" className={`${inputCls} min-w-0 flex-1`} value={draft.reportedDate} disabled={readOnly} onChange={(e) => set({ reportedDate: e.target.value })} />
            <input type="time" className={`${inputCls} w-24`} value={draft.reportedTime} disabled={readOnly} onChange={(e) => set({ reportedTime: e.target.value })} />
          </div>
        </Labeled>
      </div>
    </section>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[11px] font-medium text-ink-3">{label}</span>
      {children}
    </label>
  );
}

// ---------- result rows ----------

function ResultRow({
  row,
  a,
  selected,
  onSelect,
  setRow,
  onRemove,
  sex,
  readOnly,
}: {
  row: DraftRow;
  a: RowAssessment;
  selected: boolean;
  onSelect: () => void;
  setRow: (p: Partial<DraftRow>) => void;
  onRemove?: () => void;
  sex: PatientFacts["sex"];
  readOnly: boolean;
}) {
  const ref = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  const issues = a.issues.filter((i) => i.severity !== "info" || selected);
  const fieldIssue = (f: Issue["field"]) => a.issues.find((i) => i.field === f && i.severity !== "info")?.severity;
  const cellCls = (f: Issue["field"]) =>
    fieldIssue(f) === "error" ? "border-crit/60 bg-crit-soft" : fieldIssue(f) === "warn" ? "border-warn/50 bg-warn-soft" : "";
  const bg = selected ? "bg-accent-soft/70" : row.confidence === "low" ? "bg-warn-soft/50" : "";

  function pickCode(loinc: string) {
    const analyte = ANALYTES.find((x) => x.loinc === loinc);
    const patch: Partial<DraftRow> = { loinc: loinc || null };
    if (analyte) {
      patch.display = analyte.display;
      if (!row.unit) patch.unit = unitLabel(analyte.unit);
    } else if (!loinc) {
      patch.display = row.printedName || row.display;
    }
    setRow(patch);
  }

  function convert() {
    const c = a.conversion;
    if (!c) return;
    const r = parseRange(row.range, sex);
    let range = row.range;
    const conv = (v: number) => roundConverted(v * c.factor);
    if (r.low !== null && r.high !== null) range = `${conv(r.low)}-${conv(r.high)}`;
    else if (r.high !== null) range = `<${conv(r.high)}`;
    else if (r.low !== null) range = `>${conv(r.low)}`;
    setRow({ value: String(c.value), unit: unitLabel(c.toUnit), range, note: `${row.note ? `${row.note} ` : ""}Converted from ${row.value} ${row.unit}.`.trim() });
  }

  return (
    <>
      <tr ref={ref} onClick={onSelect} className={`border-t border-line align-top ${bg} ${row.include ? "" : "opacity-50"} cursor-pointer`}>
        <td className="px-2 py-1.5 text-center">
          <input type="checkbox" checked={row.include} disabled={readOnly} onChange={(e) => setRow({ include: e.target.checked })} onClick={(e) => e.stopPropagation()} aria-label={`File ${row.display}`} />
        </td>
        <td className="px-2 py-1">
          <input className={`${inputCls} w-full py-0.5 font-medium ${cellCls("display")}`} value={row.display} disabled={readOnly} onChange={(e) => setRow({ display: e.target.value })} placeholder="Test name" />
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-3">
            {row.printedName && row.printedName !== row.display && <span className="truncate">as printed: {row.printedName}</span>}
            <select
              className="ml-auto max-w-[190px] rounded border border-transparent bg-transparent py-0 text-[11px] text-ink-3 hover:border-line disabled:opacity-100"
              value={row.loinc ?? ""}
              disabled={readOnly}
              onChange={(e) => pickCode(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              title="LOINC code"
            >
              <option value="">Local code (unmatched)</option>
              {row.loinc && !a.analyte && <option value={row.loinc}>LOINC {row.loinc} (suggested)</option>}
              {Object.entries(PANELS).map(([key, p]) => (
                <optgroup key={key} label={p.display}>
                  {ANALYTES.filter((x) => x.panel === key).map((x) => (
                    <option key={x.loinc} value={x.loinc}>
                      {x.display} · {x.loinc}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </td>
        <td className="px-2 py-1">
          <input
            className={`${inputCls} tabular w-full py-0.5 text-right font-semibold ${flagText(a.flag)} ${cellCls("value")}`}
            value={row.value}
            disabled={readOnly}
            onChange={(e) => setRow({ value: e.target.value })}
            aria-label={`${row.display} value`}
          />
        </td>
        <td className="px-2 py-1">
          <input className={`${inputCls} w-full py-0.5 ${cellCls("unit")}`} value={row.unit} disabled={readOnly} onChange={(e) => setRow({ unit: e.target.value })} aria-label={`${row.display} unit`} />
        </td>
        <td className="px-2 py-1">
          <input className={`${inputCls} tabular w-full py-0.5 ${cellCls("range")}`} value={row.range} disabled={readOnly} onChange={(e) => setRow({ range: e.target.value })} aria-label={`${row.display} range`} />
        </td>
        <td className="whitespace-nowrap px-2 py-1.5">
          <FlagCell flag={a.flag} printed={row.printedFlag} mismatch={fieldIssue("flag") === "warn"} />
          {onRemove && !readOnly && (
            <button
              className="ml-1 text-ink-3 hover:text-crit"
              title="Remove row"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
            >
              ✕
            </button>
          )}
        </td>
      </tr>
      {issues.length > 0 && (
        <tr onClick={onSelect} className={`${bg} ${row.include ? "" : "opacity-50"} cursor-pointer`}>
          <td />
          <td colSpan={5} className="px-2 pb-1.5">
            <ul className="space-y-0.5 text-[11.5px]">
              {issues.map((i, n) => (
                <li key={n} className={i.severity === "error" ? "text-crit" : i.severity === "warn" ? "text-warn" : "text-ink-3"}>
                  {i.severity === "error" ? "✕ " : i.severity === "warn" ? "▲ " : "· "}
                  {i.text}
                  {i.field === "unit" && a.conversion && !readOnly && (
                    <button
                      className="ml-2 rounded border border-warn/40 bg-panel px-1.5 font-medium text-warn hover:bg-warn-soft"
                      onClick={(e) => {
                        e.stopPropagation();
                        convert();
                      }}
                    >
                      Convert
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

function FlagCell({ flag, printed, mismatch }: { flag: Flag | null; printed: string; mismatch: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      {flag && flag !== "N" ? <FlagBadge flag={flag} /> : flag === "N" ? <span className="text-[11px] text-ink-3">Normal</span> : <span className="text-ink-3">—</span>}
      {printed && <span className={`text-[10.5px] ${mismatch ? "font-semibold text-warn" : "text-ink-3"}`}>lab: {printed}</span>}
    </span>
  );
}

function Legend() {
  return (
    <p className="text-[11.5px] text-ink-3">
      Flags are computed from the value and the reference range, and checked against the lab&apos;s own flag. Amber rows were hard to read. Critical limits apply when the unit matches the
      chart&apos;s usual unit.
    </p>
  );
}

// ---------- helpers ----------

function groupBySection(rows: DraftRow[]): [string, DraftRow[]][] {
  const m = new Map<string, DraftRow[]>();
  for (const r of rows) m.set(r.section, [...(m.get(r.section) ?? []), r]);
  return [...m.entries()];
}

function summarizeDestinations(rows: DraftRow[], as: Map<string, RowAssessment>) {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (!r.include) continue;
    const p = panelFor(r, as.get(r.id)!);
    m.set(p.display, (m.get(p.display) ?? 0) + 1);
  }
  return [...m.entries()].map(([d, n]) => `${d} (${n})`);
}
