"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Field, inputCls } from "@/components/form";
import { chartLinks, noteTypes } from "@/lib/notes/library";
import { findMarkers, problemBlock, signBlocker, type Phrase } from "@/lib/notes/smarttext";
import { COSIGNER_REQUIRED } from "@/lib/roles";
import { SmartEditor, type SmartEditorHandle } from "./smart-editor";

type Ctx = {
  links: Record<string, string>;
  phrases: Phrase[];
  problems: { id: string; display: string; code: string; lastPlan: string | null; lastPlanDate: string | null }[];
  encounters: { id: string; label: string }[];
  cosigners: { id: string; label: string }[];
  cosignRequired: boolean;
};

type Initial = { title: string; type: string; body: string; templateId?: string | null; encounterId?: string | null; cosignerId?: string | null };

// The note-writing screen: header fields, the smart-text editor, a side panel
// of phrases / problems / chart data, and the pend and sign actions.
// mode "addendum" and "cosign" reuse it for the short text written against a signed note.
export function NoteEditor({
  mode = "note",
  action,
  ctx,
  initial,
  onDelete,
  cancelHref,
  error,
}: {
  mode?: "note" | "addendum" | "cosign";
  action: (form: FormData) => Promise<void>;
  ctx: Ctx;
  initial: Initial;
  onDelete?: () => Promise<void>;
  cancelHref?: string;
  error?: string;
}) {
  const editor = useRef<SmartEditorHandle>(null);
  const [body, setBody] = useState(initial.body);
  const [flash, setFlash] = useState(error ?? "");
  const [panel, setPanel] = useState<"phrases" | "problems" | "chart">(mode === "note" ? "problems" : "phrases");
  const [cosigner, setCosigner] = useState(initial.cosignerId ?? "");
  const dirty = useRef(false);
  const submitting = useRef(false);
  const markers = useMemo(() => findMarkers(body), [body]);
  const blanks = markers.filter((m) => m.kind === "blank").length;
  const picks = markers.length - blanks;

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current && !submitting.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  // Land on the first blank so the writer can start answering straight away.
  useEffect(() => {
    if (findMarkers(initial.body).length) requestAnimationFrame(() => editor.current?.next());
  }, [initial.body]);

  function onSign(e: React.MouseEvent) {
    const blocker =
      mode === "cosign" && !body.trim() ? null : (signBlocker(body) ?? (mode === "note" && ctx.cosignRequired && !cosigner ? COSIGNER_REQUIRED : null));
    if (blocker) {
      e.preventDefault();
      setFlash(blocker);
      editor.current?.next();
      return;
    }
    submitting.current = true;
  }

  const signLabel = mode === "addendum" ? "Sign addendum" : mode === "cosign" ? "Cosign note" : cosigner ? "Sign and route for cosign" : "Sign";

  return (
    <form action={action} className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        {mode === "note" && (
          <div className="flex flex-wrap items-end gap-2 border-b border-line px-4 py-2.5">
            <Field label="Title" className="min-w-48 flex-1">
              <input name="title" defaultValue={initial.title} className={inputCls} onChange={() => (dirty.current = true)} />
            </Field>
            <Field label="Note type">
              <select name="type" defaultValue={initial.type} className={inputCls}>
                {noteTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Encounter" className="max-w-72">
              <select name="encounterId" defaultValue={initial.encounterId ?? ""} className={inputCls}>
                <option value="">No encounter (dated today)</option>
                {ctx.encounters.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </Field>
            <input type="hidden" name="templateId" value={initial.templateId ?? ""} />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-panel-muted px-4 py-1.5 text-[11.5px] text-ink-3">
          <span>
            Type <Kbd>.</Kbd> for phrases, <Kbd>@</Kbd> for chart data. <Kbd>F2</Kbd> jumps to the next blank, <Kbd>Shift</Kbd>+<Kbd>F2</Kbd> back.
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            {markers.length === 0 ? (
              <span className="font-medium text-ok">Ready to sign</span>
            ) : (
              <>
                {blanks > 0 && <span className="rounded bg-warn-soft px-1.5 py-px font-semibold text-warn">{blanks} *** left</span>}
                {picks > 0 && <span className="rounded bg-accent-soft px-1.5 py-px font-semibold text-accent">{picks} to choose</span>}
                <button type="button" onClick={() => editor.current?.next()} className="rounded border border-line bg-panel px-1.5 py-px font-medium text-ink-2 hover:border-accent hover:text-accent">
                  Next
                </button>
              </>
            )}
          </span>
        </div>

        {flash && (
          <div role="alert" className="flex items-center justify-between border-b border-warn/30 bg-warn-soft px-4 py-1.5 text-[12.5px] text-warn">
            <span>{flash}</span>
            <button type="button" onClick={() => setFlash("")} className="px-1 font-semibold">
              ×
            </button>
          </div>
        )}

        <SmartEditor
          ref={editor}
          name="body"
          value={body}
          onChange={(v) => {
            dirty.current = true;
            setBody(v);
            if (flash && !signBlocker(v)) setFlash("");
          }}
          phrases={ctx.phrases}
          links={ctx.links}
          autoFocus={mode !== "note"}
          placeholder={mode === "addendum" ? "Addendum text…" : mode === "cosign" ? "Attestation (optional)…" : "Start typing, or type . to pick a phrase…"}
        />

        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
          <Button type="submit" name="intent" value="sign" onClick={onSign}>
            {signLabel}
          </Button>
          {mode === "note" && (
            <>
              <Button type="submit" name="intent" value="pend" variant="secondary" title="Save without signing" onClick={() => (submitting.current = true)}>
                Pend
              </Button>
              <label className="ml-2 flex items-center gap-1.5 text-[12px] text-ink-2">
                Cosigner
                <select name="cosignerId" value={cosigner} onChange={(e) => setCosigner(e.target.value)} className={`${inputCls} py-0.5`}>
                  <option value="">{ctx.cosignRequired ? "Choose (required)" : "None"}</option>
                  {ctx.cosigners.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <span className="ml-auto flex items-center gap-2">
            {onDelete && (
              <Button
                type="submit"
                formAction={onDelete}
                formNoValidate
                variant="danger"
                onClick={(e) => {
                  if (!window.confirm("Delete this pended note?")) e.preventDefault();
                  else submitting.current = true;
                }}
              >
                Delete
              </Button>
            )}
            {cancelHref && (
              <Link href={cancelHref} className="rounded px-2.5 py-1 text-[12.5px] font-medium text-ink-2 hover:bg-panel-muted">
                Cancel
              </Link>
            )}
          </span>
        </div>
      </div>

      <aside className="flex w-72 shrink-0 flex-col border-l border-line bg-panel-muted">
        <div className="flex border-b border-line text-[12px]">
          {(
            [
              ["problems", "Problems"],
              ["phrases", "Phrases"],
              ["chart", "Chart data"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPanel(id)}
              className={`-mb-px flex-1 border-b-2 px-2 py-2 ${panel === id ? "border-accent font-semibold text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {panel === "problems" && <ProblemsPanel problems={ctx.problems} insert={(t) => editor.current?.insert(t, { block: true, gap: true })} />}
          {panel === "phrases" && <PhrasesPanel phrases={ctx.phrases} insert={(t) => editor.current?.insert(t, { block: true })} />}
          {panel === "chart" && <ChartPanel links={ctx.links} insert={(t) => editor.current?.insert(t, { block: true })} />}
        </div>
      </aside>
    </form>
  );
}

function ProblemsPanel({ problems, insert }: { problems: Ctx["problems"]; insert: (t: string) => void }) {
  if (!problems.length) return <p className="p-3 text-ink-3">No active problems on the problem list.</p>;
  return (
    <div>
      <p className="px-3 pt-2.5 pb-1 text-[11.5px] text-ink-3">Build the assessment and plan by problem. Place the cursor, then add a problem.</p>
      <ul>
        {problems.map((p) => (
          <li key={p.id} className="border-b border-line px-3 py-2">
            <div className="font-medium leading-snug">{p.display}</div>
            <div className="font-mono text-[11px] text-ink-3">{p.code}</div>
            {p.lastPlan && (
              <p className="mt-1 line-clamp-3 border-l-2 border-line pl-2 text-[11.5px] text-ink-2" title={p.lastPlan}>
                <span className="text-ink-3">Last plan ({p.lastPlanDate}): </span>
                {p.lastPlan.replace(/^.*?\)\s*:?\s*/, "")}
              </p>
            )}
            <div className="mt-1.5 flex gap-1.5">
              <SideButton onClick={() => insert(problemBlock(p))}>Add to A&amp;P</SideButton>
              {p.lastPlan && <SideButton onClick={() => insert(`# ${p.lastPlan}`)}>Carry forward</SideButton>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PhrasesPanel({ phrases, insert }: { phrases: Phrase[]; insert: (t: string) => void }) {
  const [q, setQ] = useState("");
  const shown = phrases.filter((p) => !q || p.name.includes(q.toLowerCase().replace(/^\./, "")) || p.description.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="flex items-center gap-2 p-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search phrases" className={`${inputCls} min-w-0 flex-1`} />
        <Link href="/phrases" className="shrink-0 text-[11.5px] font-medium text-accent hover:underline">
          My phrases
        </Link>
      </div>
      <ul>
        {shown.map((p) => (
          <li key={p.name}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(p.body)}
              className="block w-full border-t border-line px-3 py-1.5 text-left hover:bg-panel"
              title={p.body}
            >
              <span className="font-mono text-[12px] font-semibold text-accent">.{p.name}</span>
              {p.mine && <span className="ml-1.5 rounded bg-accent-soft px-1 text-[10px] font-semibold text-accent">MINE</span>}
              <span className="block text-[11.5px] text-ink-2">{p.description}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChartPanel({ links, insert }: { links: Record<string, string>; insert: (t: string) => void }) {
  return (
    <ul>
      {chartLinks.map((l) => (
        <li key={l.name}>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insert(links[l.name] ?? "")}
            className="block w-full border-b border-line px-3 py-1.5 text-left hover:bg-panel"
            title={links[l.name]}
          >
            <span className="font-mono text-[12px] font-semibold text-accent">@{l.name}@</span>
            <span className="ml-1.5 text-[11.5px] text-ink-2">{l.description}</span>
            <span className="block truncate text-[11.5px] text-ink-3">{links[l.name]?.split("\n").slice(0, 2).join(" · ")}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SideButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="rounded border border-line bg-panel px-1.5 py-0.5 text-[11.5px] font-medium text-ink-2 hover:border-accent hover:text-accent"
    >
      {children}
    </button>
  );
}

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="rounded border border-line bg-panel px-1 font-mono text-[10.5px] text-ink-2">{children}</kbd>
);
