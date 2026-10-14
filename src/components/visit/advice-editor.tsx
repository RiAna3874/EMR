"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/form";
import { ADVICE } from "@/lib/visits/advice";

const groups = [...new Set(ADVICE.map((a) => a.group))];

// Advice for the visit prescription. A phrase is added with one click and prints in
// English or Bangla, whichever the printout uses; typed lines print as typed.
export function AdviceEditor({ action, initial, readOnly }: { action: (form: FormData) => Promise<void>; initial: string; readOnly?: boolean }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  const lines = text.split("\n").map((l) => l.trim());
  const add = (line: string) => {
    if (lines.includes(line)) return;
    setText((t) => (t.trim() ? `${t.replace(/\s+$/, "")}\n${line}` : line));
    ref.current?.focus();
  };
  return (
    <form
      action={async (form) => {
        await action(form);
        setSaved(String(form.get("advice") ?? ""));
      }}
      className="space-y-2 p-3"
    >
      {!readOnly && (
        <details open={!initial.trim()} className="space-y-1.5">
          <summary className="cursor-pointer text-[12px] font-medium text-accent">Common advice (prints in English or Bangla)</summary>
          {groups.map((g) => (
            <div key={g} className="flex flex-wrap items-baseline gap-1.5">
              <span className="w-28 shrink-0 text-[11px] font-medium text-ink-3">{g}</span>
              {ADVICE.filter((a) => a.group === g).map((a) => {
                const used = lines.includes(a.en) || lines.includes(a.bn);
                return (
                  <button
                    key={a.id}
                    type="button"
                    title={a.bn}
                    disabled={used}
                    onClick={() => add(a.en)}
                    className={`rounded-full border px-2 py-0.5 text-[11.5px] ${used ? "border-accent/30 bg-accent-soft text-ink-3" : "border-line bg-panel hover:border-accent hover:text-accent"}`}
                  >
                    {used ? "✓ " : "+ "}
                    {a.en}
                  </button>
                );
              })}
            </div>
          ))}
        </details>
      )}
      <textarea
        ref={ref}
        name="advice"
        value={text}
        readOnly={readOnly}
        onChange={(e) => setText(e.target.value)}
        rows={Math.max(3, lines.length + 1)}
        placeholder="One piece of advice per line. Type your own or click the phrases above."
        className="w-full rounded border border-line bg-panel px-2 py-1.5 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
      />
      {!readOnly && (
        <div className="flex items-center gap-2">
          <Button type="submit" variant={text.trim() === saved.trim() ? "secondary" : "primary"}>
            Save advice
          </Button>
          {text.trim() !== saved.trim() && <span className="text-[12px] text-warn">Not saved yet</span>}
        </div>
      )}
    </form>
  );
}
