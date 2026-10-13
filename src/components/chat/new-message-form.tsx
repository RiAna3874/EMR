"use client";

import type { ChatStatus, Role } from "@prisma/client";
import { useActionState, useEffect, useState } from "react";
import { startConversation, type ChatState } from "@/app/messages/actions";
import { Button, Field, inputCls } from "@/components/form";
import { MAX_BODY, roleOrder, statusDot, statusLabel } from "@/lib/chat/chat";
import { roleLabel } from "@/lib/roles";

export type Staff = { id: string; name: string; credentials: string | null; role: Role; chatStatus: ChatStatus; chatStatusNote: string | null; hint?: string };
type PatientPick = { id: string; name: string; detail: string };

export function NewMessageForm({ staff, selected, patient: initialPatient }: { staff: Staff[]; selected: string[]; patient: PatientPick | null }) {
  const [state, action, pending] = useActionState<ChatState, FormData>(startConversation, undefined);
  const [to, setTo] = useState<string[]>(selected);
  const [filter, setFilter] = useState("");
  const [patient, setPatient] = useState<PatientPick | null>(initialPatient);
  const [pq, setPq] = useState("");
  const [matches, setMatches] = useState<PatientPick[]>([]);
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    if (pq.trim().length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/patients?q=${encodeURIComponent(pq.trim())}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then(setMatches)
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [pq]);

  const needle = filter.trim().toLowerCase();
  const visible = staff.filter((s) => !needle || s.name.toLowerCase().includes(needle) || roleLabel[s.role].toLowerCase().includes(needle));
  const toggle = (id: string) => setTo((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const chosen = staff.filter((s) => to.includes(s.id));

  return (
    <form action={action} className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-0">
      <section className="flex min-h-0 flex-col border-r border-line">
        <div className="border-b border-line px-4 py-2.5">
          <h2 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-2">To</h2>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find staff by name or role" aria-label="Find staff" className={`${inputCls} w-full`} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {roleOrder.map((role) => {
            const people = visible.filter((s) => s.role === role);
            if (!people.length) return null;
            return (
              <fieldset key={role}>
                <legend className="w-full bg-panel-muted px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{roleLabel[role]}</legend>
                {people.map((s) => (
                  <label key={s.id} className={`flex cursor-pointer items-center gap-2.5 border-b border-line px-4 py-2 ${to.includes(s.id) ? "bg-accent-soft" : "hover:bg-panel-muted"}`}>
                    <input type="checkbox" checked={to.includes(s.id)} onChange={() => toggle(s.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">
                        {s.name}
                        {s.credentials && <span className="font-normal text-ink-3">, {s.credentials}</span>}
                      </span>
                      {s.hint && <span className="block text-[11.5px] text-accent">{s.hint}</span>}
                    </span>
                    <span className="flex items-center gap-1 text-[11.5px] text-ink-3" title={s.chatStatusNote ?? undefined}>
                      <span className={`h-2 w-2 rounded-full ${statusDot[s.chatStatus]}`} aria-hidden />
                      {statusLabel[s.chatStatus]}
                      {s.chatStatusNote && `: ${s.chatStatusNote}`}
                    </span>
                  </label>
                ))}
              </fieldset>
            );
          })}
        </div>
      </section>

      <section className="flex min-h-0 flex-col gap-3 overflow-y-auto px-5 py-4">
        {/* Chosen people stay chosen while the list is filtered. */}
        {to.map((id) => (
          <input key={id} type="hidden" name="to" value={id} />
        ))}
        <div className="text-[12.5px]">
          <span className="text-ink-3">To: </span>
          {chosen.length ? chosen.map((s) => s.name).join(", ") : <span className="text-ink-3">nobody yet</span>}
        </div>
        {chosen.length > 1 && (
          <Field label="Group name (optional)">
            <input name="title" maxLength={60} placeholder="e.g. Diabetes clinic huddle" className={inputCls} />
          </Field>
        )}
        <div>
          <span className="text-[11px] font-medium text-ink-3">About a patient (optional)</span>
          {patient ? (
            <div className="mt-0.5 flex items-center gap-2 rounded border border-low/30 bg-low-soft px-2.5 py-1.5">
              <input type="hidden" name="patientId" value={patient.id} />
              <span className="font-medium text-low">{patient.name}</span>
              <span className="text-[12px] text-ink-2">{patient.detail}</span>
              <button type="button" onClick={() => setPatient(null)} className="ml-auto rounded px-1 text-ink-3 hover:bg-panel" aria-label="Remove patient">
                ×
              </button>
            </div>
          ) : (
            <div className="relative mt-0.5">
              <input value={pq} onChange={(e) => setPq(e.target.value)} placeholder="Name, MRN or date of birth" aria-label="Patient" className={`${inputCls} w-full`} />
              {pq.trim().length >= 2 && matches.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full rounded border border-line bg-panel shadow-md">
                  {matches.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setPatient(m);
                          setPq("");
                          setMatches([]);
                        }}
                        className="flex w-full gap-2 px-2.5 py-1.5 text-left hover:bg-accent-soft"
                      >
                        <span className="font-medium">{m.name}</span>
                        <span className="text-[12px] text-ink-3">{m.detail}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <Field label="Message">
          <textarea
            name="body"
            rows={6}
            maxLength={MAX_BODY}
            className={`${inputCls} resize-y ${urgent ? "border-crit" : ""}`}
            placeholder="What do you need?"
          />
        </Field>
        <label className={`flex items-center gap-1.5 text-[12.5px] ${urgent ? "font-semibold text-crit" : "text-ink-2"}`}>
          <input type="checkbox" name="urgent" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
          Urgent: shows in red and alerts even if they have this conversation muted
        </label>
        {state?.error && (
          <p role="alert" className="text-[12.5px] text-crit">
            {state.error}
          </p>
        )}
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send"}
          </Button>
        </div>
      </section>
    </form>
  );
}
