"use client";

import { useRef, useState } from "react";
import { Button, Field, inputCls } from "@/components/form";

const templates: Record<string, string> = {
  progress: "SUBJECTIVE\n\n\nOBJECTIVE\n.vitals \n\nASSESSMENT AND PLAN\n.problems \n",
  history_physical:
    "CHIEF COMPLAINT\n\n\nHISTORY OF PRESENT ILLNESS\n\n\n.problems \n\n.meds \n\n.allergies \n\nPHYSICAL EXAM\n.vitals \n\nASSESSMENT AND PLAN\n",
  consult: "REASON FOR CONSULTATION\n\n\nFINDINGS\n.labs \n\nRECOMMENDATIONS\n",
  phone: "Caller: \nReason for call: \n\nAdvice given: \n",
};

export function NoteEditor({
  action,
  smartText,
  initial,
  onDelete,
}: {
  action: (form: FormData) => Promise<void>;
  smartText: Record<string, string>;
  initial?: { title: string; type: string; body: string };
  onDelete?: () => Promise<void>;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [type, setType] = useState(initial?.type ?? "progress");
  const [body, setBody] = useState(() => expandAll(initial?.body ?? templates.progress, smartText));
  const [touched, setTouched] = useState(!!initial);

  // Expand ".phrase" into live chart data as soon as it is followed by a space or newline.
  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setTouched(true);
    const el = e.target;
    const caret = el.selectionStart;
    const before = el.value.slice(0, caret);
    const m = before.match(/(^|\s)\.(\w+)([ \n])$/);
    if (m && smartText[m[2].toLowerCase()]) {
      const start = caret - m[2].length - 2;
      const insert = smartText[m[2].toLowerCase()] + m[3];
      const next = el.value.slice(0, start) + insert + el.value.slice(caret);
      setBody(next);
      requestAnimationFrame(() => {
        ref.current?.setSelectionRange(start + insert.length, start + insert.length);
      });
      return;
    }
    setBody(el.value);
  }

  function changeType(t: string) {
    setType(t);
    if (!touched) setBody(expandAll(templates[t], smartText));
  }

  function insert(key: string) {
    const el = ref.current;
    if (!el) return;
    const pos = el.selectionStart;
    const text = smartText[key] + "\n";
    setBody(body.slice(0, pos) + text + body.slice(pos));
    setTouched(true);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos + text.length, pos + text.length);
    });
  }

  return (
    <form action={action} className="flex h-full flex-col">
      <div className="flex flex-wrap items-end gap-2 border-b border-line p-3">
        <Field label="Title" className="min-w-56 flex-1">
          <input name="title" defaultValue={initial?.title ?? "Office visit"} className={inputCls} />
        </Field>
        <Field label="Type">
          <select name="type" value={type} onChange={(e) => changeType(e.target.value)} className={inputCls}>
            <option value="progress">Progress note</option>
            <option value="history_physical">History and physical</option>
            <option value="consult">Consult</option>
            <option value="phone">Telephone encounter</option>
          </select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-panel-muted px-3 py-1.5 text-[12px] text-ink-3">
        <span className="mr-1">Insert:</span>
        {Object.keys(smartText).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => insert(k)}
            className="rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2 hover:border-accent hover:text-accent"
          >
            .{k}
          </button>
        ))}
        <span className="ml-auto">Type a phrase like .vitals then a space to pull in chart data.</span>
      </div>
      <textarea
        ref={ref}
        name="body"
        value={body}
        onChange={onChange}
        spellCheck
        className="min-h-[360px] flex-1 resize-none p-4 font-mono text-[13px] leading-relaxed outline-none"
      />
      <div className="flex items-center gap-2 border-t border-line p-3">
        <Button type="submit" name="intent" value="sign">
          Sign note
        </Button>
        <Button type="submit" name="intent" value="draft" variant="secondary">
          Save draft
        </Button>
        {onDelete && (
          <Button type="submit" formAction={onDelete} formNoValidate variant="danger" className="ml-auto">
            Delete draft
          </Button>
        )}
      </div>
    </form>
  );
}

function expandAll(text: string, smartText: Record<string, string>) {
  return text.replace(/(^|\s)\.(\w+) /g, (whole, lead: string, key: string) =>
    smartText[key] !== undefined ? lead + smartText[key] : whole,
  );
}
