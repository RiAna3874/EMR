"use client";

import { useEffect, useState } from "react";
import { dailyMedUrl, type DrugLabel } from "@/lib/meds/drug-label";

type Info = { names: string[]; label: DrugLabel | null; error?: string };

// Answers for the session, so reopening a panel or another row with the same
// medication doesn't ask again.
const seen = new Map<string, Info>();

const PREVIEW = 420;

function Section({ label, text, open: startOpen }: { label: string; text: string; open?: boolean }) {
  const [full, setFull] = useState(false);
  const long = text.length > PREVIEW;
  return (
    <details open={startOpen} className="border-t border-line py-1.5 first:border-t-0">
      <summary className="cursor-pointer text-[12px] font-semibold text-ink-2">{label}</summary>
      <div className="mt-1 whitespace-pre-line text-[12.5px] leading-relaxed">
        {full || !long ? text : `${text.slice(0, PREVIEW).replace(/\s+\S*$/, "")}…`}
        {long && (
          <button type="button" onClick={() => setFull(!full)} className="ml-1 text-[12px] text-accent hover:underline">
            {full ? "Show less" : "Show all"}
          </button>
        )}
      </div>
    </details>
  );
}

// The US prescribing label for a medication (openFDA), opened on demand: indications,
// dose, kidney dosing, contraindications, warnings and interactions.
// In a narrow table column (the Meds tab), float: the panel opens as a sheet at the side of the page.
export function DrugInfo({ drug, className = "", float = false }: { drug: string; className?: string; float?: boolean }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<Info | null>(() => seen.get(drug) ?? null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setInfo(seen.get(drug) ?? null);
  }, [drug]);

  useEffect(() => {
    if (!open || seen.has(drug)) return;
    let live = true;
    setLoading(true);
    // Wait for typing to pause in the outside-medication form.
    const timer = setTimeout(() => fetch(`/api/drug-info?drug=${encodeURIComponent(drug)}`)
      .then((r) => (r.ok ? r.json() : { names: [], label: null, error: `The server answered ${r.status}` }))
      .catch(() => ({ names: [], label: null, error: "Couldn't reach the server" }))
      .then((i: Info) => {
        if (!i.error) seen.set(drug, i);
        if (live) {
          setInfo(i);
          setLoading(false);
        }
      }), 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [open, drug]);

  const label = info?.label;
  return (
    <div className={className} onKeyDown={(e) => float && e.key === "Escape" && setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="text-[12px] font-medium text-accent hover:underline"
        title="Indications, dose, kidney dosing, contraindications and warnings from the US prescribing label"
      >
        {open ? "Hide drug info" : "Drug info"}
      </button>
      {open && (
        <div
          className={`mt-1 rounded border border-line bg-panel px-3 py-2 text-ink ${
            float ? "fixed inset-y-0 right-0 z-50 mt-0 w-[min(44rem,100vw)] overflow-y-auto rounded-none shadow-2xl" : "max-w-3xl"
          }`}
        >
          {float && (
            <div className="sticky -top-2 -mx-3 -mt-2 mb-2 flex items-center justify-between border-b border-line bg-panel px-3 py-2">
              <span className="text-[13px] font-semibold">Drug info: {drug}</span>
              <button type="button" onClick={() => setOpen(false)} className="rounded px-2 text-[18px] leading-none text-ink-2 hover:bg-panel-muted" aria-label="Close drug info" autoFocus>
                ×
              </button>
            </div>
          )}
          {loading && !info && <p className="text-[12px] text-ink-3">Looking up the prescribing label…</p>}
          {info?.error && <p className="text-[12px] text-warn">Couldn&apos;t get the label: {info.error}.</p>}
          {info && !info.error && !label && (
            <p className="text-[12px] text-ink-2">
              {info.names.length
                ? `No US prescribing label for ${info.names.join(" + ")}. It may not be sold in the US; check the package insert or the BNF.`
                : "Type a medication name to see its prescribing label."}
            </p>
          )}
          {label && (
            <>
              <div className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-ink-3">
                <span className="text-[13px] font-semibold text-ink">{label.generic || label.title}</span>
                <span>
                  US label{label.title && label.title !== label.generic ? ` (${label.title}${label.manufacturer ? `, ${label.manufacturer}` : ""})` : ""}
                  {label.updated && `, updated ${label.updated}`}
                </span>
                {label.setId && (
                  <a href={dailyMedUrl(label.setId)} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    Full label on DailyMed
                  </a>
                )}
              </div>
              {label.kidney.length > 0 && (
                <div className="my-1.5 rounded bg-warn-soft px-2 py-1.5 text-[12.5px]">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-warn">Kidney</div>
                  <ul className="ml-4 list-disc">
                    {label.kidney.map((k, i) => (
                      <li key={i}>{k}</li>
                    ))}
                  </ul>
                </div>
              )}
              {label.sections.map((s) => (
                <Section key={s.key} label={s.label} text={s.text} open={s.key === "boxed" || s.key === "indications" || s.key === "dose"} />
              ))}
              <p className="mt-1 border-t border-line pt-1.5 text-[11px] text-ink-3">
                From the US FDA label via openFDA, for reference. Bangladeshi products and doses can differ; the checks above still apply.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
