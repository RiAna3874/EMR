"use client";

import { useState, useTransition } from "react";
import type { PatientTaking } from "@prisma/client";
import { Button, inputCls } from "@/components/form";

const takingOptions: { id: PatientTaking; label: string }[] = [
  { id: "taking", label: "Taking" },
  { id: "not_taking", label: "Not taking" },
  { id: "taking_differently", label: "Differently" },
];

// Medication review: what the patient says they do, with a note when it isn't as prescribed.
export function TakingControl({ value, note, action, disabled }: { value: PatientTaking | null; note: string | null; action: (form: FormData) => Promise<void>; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState<PatientTaking | null>(null);
  const send = (taking: PatientTaking, takingNote = "") => {
    const f = new FormData();
    f.set("taking", taking);
    f.set("takingNote", takingNote);
    start(async () => {
      await action(f);
      setAsking(null);
    });
  };
  if (disabled) {
    return value ? <span className="text-[12px] text-ink-2">{takingOptions.find((o) => o.id === value)?.label}</span> : <span className="text-[12px] text-ink-3">Not asked</span>;
  }
  return (
    <div className="space-y-1">
      <div className="inline-flex overflow-hidden rounded border border-line text-[11.5px]" role="group" aria-label="Patient is taking">
        {takingOptions.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={pending}
            onClick={() => (o.id === "taking" ? send("taking") : setAsking(o.id))}
            className={`whitespace-nowrap border-l border-line px-1.5 py-0.5 first:border-l-0 ${
              value === o.id ? (o.id === "taking" ? "bg-accent text-white" : "bg-warn text-white") : "bg-panel text-ink-2 hover:bg-panel-muted"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {asking && (
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            send(asking, String(new FormData(e.currentTarget).get("note") ?? ""));
          }}
        >
          <input name="note" autoFocus defaultValue={note ?? ""} placeholder={asking === "not_taking" ? "Why not?" : "How are they taking it?"} className={`${inputCls} w-44 py-0.5 text-[12px]`} />
          <Button type="submit" variant="secondary" className="py-0.5 text-[11.5px]" disabled={pending}>
            Save
          </Button>
        </form>
      )}
      {!asking && value && value !== "taking" && note && <div className="max-w-52 text-[11.5px] text-warn">{note}</div>}
    </div>
  );
}

export const DISCONTINUE_REASONS = ["Course completed", "Not effective", "Side effect", "Patient preference", "Duplicate therapy", "Changed to another medication", "No longer indicated", "Entered in error"];

export function DiscontinueButton({ drug, action }: { drug: string; action: (form: FormData) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <Button type="button" variant="danger" onClick={() => setOpen(true)}>
        Discontinue
      </Button>
    );
  }
  return (
    <form
      className="mt-1 flex items-center justify-end gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          await action(f);
          setOpen(false);
        });
      }}
    >
      <select name="reason" aria-label={`Reason to discontinue ${drug}`} className={`${inputCls} py-0.5 text-[12px]`} defaultValue="" required>
        <option value="" disabled>
          Reason…
        </option>
        {DISCONTINUE_REASONS.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
      <Button type="submit" variant="danger" className="border-crit/40" disabled={pending}>
        Discontinue
      </Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}

// A form whose server action may answer with an error to show in place.
export function ResultForm({
  action,
  children,
  className,
}: {
  action: (form: FormData) => Promise<{ error: string } | void>;
  children: React.ReactNode;
  className?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className={className}
      action={(form) =>
        start(async () => {
          setError(null);
          const res = await action(form);
          if (res?.error) setError(res.error);
        })
      }
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {error && <p className="w-full text-[12px] text-crit">{error}</p>}
    </form>
  );
}
