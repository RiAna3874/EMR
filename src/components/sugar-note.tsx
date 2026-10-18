"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, inputCls } from "@/components/form";
import { saveSugarNote } from "@/app/patients/[id]/sugar/actions";
import { SUGAR_NOTE_MAX } from "@/lib/labs/sugar-days";

// A day's note on the Blood sugar tab: the text with an Edit link, or "Add note".
export function SugarNote({
  patientId,
  day,
  text,
  by,
  canEdit,
  phone,
}: {
  patientId: string;
  day: string;
  text?: string;
  by?: string;
  canEdit: boolean;
  phone?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) return <NoteForm patientId={patientId} day={day} text={text ?? ""} phone={phone} onDone={() => setEditing(false)} />;
  return (
    <div className={`flex items-baseline gap-2 ${phone ? "text-[13.5px]" : "text-[12.5px]"}`}>
      {text ? (
        <span className="min-w-0 flex-1 whitespace-pre-wrap text-ink-2" title={by}>
          {text}
        </span>
      ) : (
        !canEdit && <span className="text-ink-3">—</span>
      )}
      {canEdit && (
        <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-[12px] font-medium text-accent hover:underline">
          {text ? "Edit" : "Add note"}
        </button>
      )}
    </div>
  );
}

// "Add a note" for any day, including one with no readings yet.
export function AddSugarNote({ patientId, today, phone }: { patientId: string; today: string; phone?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[12px] font-medium text-accent hover:underline">
        + Note for a day
      </button>
    );
  return <NoteForm patientId={patientId} today={today} text="" phone={phone} onDone={() => setOpen(false)} />;
}

function NoteForm({
  patientId,
  day: fixedDay,
  today,
  text,
  phone,
  onDone,
}: {
  patientId: string;
  day?: string;
  today?: string;
  text: string;
  phone?: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const [day, setDay] = useState(fixedDay ?? today ?? "");
  const [value, setValue] = useState(text);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const save = (next = value) =>
    start(async () => {
      const r = await saveSugarNote(patientId, day, next);
      if (r?.error) return setError(r.error);
      onDone();
      router.refresh();
    });
  return (
    <div className="flex w-full flex-col gap-1.5">
      {!fixedDay && (
        <label className="flex items-center gap-2 text-[12px] text-ink-3">
          Day
          <input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} className={inputCls} />
        </label>
      )}
      <textarea
        autoFocus
        rows={phone ? 3 : 2}
        value={value}
        maxLength={SUGAR_NOTE_MAX}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
          if (e.key === "Escape") onDone();
        }}
        placeholder="e.g. Missed breakfast, insulin taken late, ate sweets"
        aria-label="Note for this day"
        className={`${inputCls} w-full ${phone ? "text-[15px]" : ""}`}
      />
      {error && <div className="text-[12px] text-crit">{error}</div>}
      <div className="flex gap-2">
        <Button type="button" onClick={() => save()} disabled={pending}>
          {pending ? "Saving…" : "Save note"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        {text && (
          <Button type="button" variant="danger" className="ml-auto" disabled={pending} onClick={() => save("")}>
            Remove note
          </Button>
        )}
      </div>
    </div>
  );
}
