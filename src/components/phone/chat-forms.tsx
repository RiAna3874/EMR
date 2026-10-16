"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { sendMessage, startConversation, type ChatState } from "@/app/messages/actions";
import { MAX_BODY, roleOrder, statusDot } from "@/lib/chat/chat";
import { roleLabel } from "@/lib/roles";
import type { Staff } from "@/components/chat/new-message-form";

const boxCls = "w-full resize-none rounded-lg border bg-panel px-3 py-2 text-[16px] outline-none focus:ring-2";

// Typing a reply on the phone: Return starts a new line (as phone keyboards expect); the button sends.
export function PhoneComposer({ conversationId, awayNote }: { conversationId: string; awayNote: string | null }) {
  const [state, action, pending] = useActionState<ChatState, FormData>(sendMessage.bind(null, conversationId), undefined);
  const form = useRef<HTMLFormElement>(null);
  const [urgent, setUrgent] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    if (!state?.sent) return;
    form.current?.reset();
    setText("");
    setUrgent(false);
  }, [state?.sent]);

  return (
    <form
      ref={form}
      action={action}
      className={`fixed inset-x-0 bottom-0 z-30 border-t bg-panel px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 ${urgent ? "border-crit" : "border-line"}`}
    >
      {awayNote && <p className="mb-1 text-[12.5px] text-warn">{awayNote}</p>}
      {state?.error && (
        <p role="alert" className="mb-1 text-[12.5px] text-crit">
          {state.error}
        </p>
      )}
      <div className="flex items-end gap-2">
        <textarea
          name="body"
          rows={1}
          maxLength={MAX_BODY}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message"
          aria-label="Message"
          className={`${boxCls} max-h-32 min-h-10 ${urgent ? "border-crit focus:ring-crit/15" : "border-line focus:border-accent focus:ring-accent/15"}`}
          style={{ height: `${Math.min(8, Math.max(1, text.split("\n").length)) * 1.5 + 1}rem` }}
        />
        <button type="submit" disabled={pending || !text.trim()} className={`h-10 shrink-0 rounded-lg px-4 font-semibold text-white disabled:opacity-50 ${urgent ? "bg-crit" : "bg-accent"}`}>
          {pending ? "…" : "Send"}
        </button>
      </div>
      <label className={`mt-1 flex items-center gap-1.5 text-[13px] ${urgent ? "font-semibold text-crit" : "text-ink-2"}`}>
        <input type="checkbox" name="urgent" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="h-4 w-4" />
        Urgent
      </label>
    </form>
  );
}

// A new conversation from the phone: pick people (care team first), write, send.
export function PhoneNewMessage({ staff, patient }: { staff: Staff[]; patient: { id: string; name: string; detail: string } | null }) {
  const [state, action, pending] = useActionState<ChatState, FormData>(startConversation, undefined);
  const [to, setTo] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [withPatient, setWithPatient] = useState(!!patient);
  const needle = filter.trim().toLowerCase();
  const visible = staff.filter((s) => !needle || s.name.toLowerCase().includes(needle) || roleLabel[s.role].toLowerCase().includes(needle));
  const toggle = (id: string) => setTo((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const careTeam = visible.filter((s) => s.hint);

  return (
    <form action={action} className="pb-4">
      <input type="hidden" name="from" value="phone" />
      {to.map((id) => (
        <input key={id} type="hidden" name="to" value={id} />
      ))}
      {patient && withPatient && <input type="hidden" name="patientId" value={patient.id} />}

      {patient && (
        <div className="mx-4 mt-3 flex items-center gap-3 rounded-lg border border-low/20 bg-low-soft px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-low">About</div>
            <div className={`truncate font-semibold ${withPatient ? "" : "text-ink-3 line-through"}`}>{patient.name}</div>
            <div className="truncate text-[12.5px] text-ink-2">{patient.detail}</div>
          </div>
          <button type="button" onClick={() => setWithPatient((w) => !w)} className="shrink-0 text-[13px] font-medium text-low">
            {withPatient ? "Remove" : "Add back"}
          </button>
        </div>
      )}

      <div className="px-4 pt-3">
        <textarea
          name="body"
          rows={4}
          maxLength={MAX_BODY}
          placeholder="Write a message"
          aria-label="Message"
          className={`${boxCls} ${urgent ? "border-crit focus:ring-crit/15" : "border-line focus:border-accent focus:ring-accent/15"}`}
        />
        {to.length > 1 && <input name="title" maxLength={60} placeholder="Group name (optional)" aria-label="Group name" className={`${boxCls} mt-2 border-line focus:border-accent focus:ring-accent/15`} />}
        <div className="mt-2 flex items-center gap-3">
          <label className={`flex items-center gap-1.5 text-[14px] ${urgent ? "font-semibold text-crit" : "text-ink-2"}`}>
            <input type="checkbox" name="urgent" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="h-4 w-4" />
            Urgent
          </label>
          <span className="flex-1 text-right text-[13px] text-ink-3">{to.length ? `To ${to.length} ${to.length === 1 ? "person" : "people"}` : "Choose who below"}</span>
          <button type="submit" disabled={pending || !to.length} className={`rounded-lg px-5 py-2 font-semibold text-white disabled:opacity-50 ${urgent ? "bg-crit" : "bg-accent"}`}>
            {pending ? "Sending…" : "Send"}
          </button>
        </div>
        {state?.error && (
          <p role="alert" className="mt-2 text-[13px] text-crit">
            {state.error}
          </p>
        )}
      </div>

      <div className="px-4 pt-4">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Find staff by name or role"
          aria-label="Find staff"
          className={`${boxCls} border-line focus:border-accent focus:ring-accent/15`}
        />
      </div>
      {careTeam.length > 0 && <People title="Care team" people={careTeam} to={to} toggle={toggle} />}
      {roleOrder.map((role) => (
        <People key={role} title={roleLabel[role]} people={visible.filter((s) => s.role === role && !s.hint)} to={to} toggle={toggle} />
      ))}
    </form>
  );
}

function People({ title, people, to, toggle }: { title: string; people: Staff[]; to: string[]; toggle: (id: string) => void }) {
  if (!people.length) return null;
  return (
    <fieldset className="mt-3">
      <legend className="px-4 pb-1 text-[12px] font-semibold uppercase tracking-wide text-ink-3">{title}</legend>
      <div className="border-y border-line bg-panel">
        {people.map((s) => (
          <label key={s.id} className={`flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 ${to.includes(s.id) ? "bg-accent-soft" : ""}`}>
            <input type="checkbox" checked={to.includes(s.id)} onChange={() => toggle(s.id)} className="h-5 w-5" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{s.name}</span>
              <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
                <span className={`h-2 w-2 rounded-full ${statusDot[s.chatStatus]}`} aria-hidden />
                {s.hint ?? roleLabel[s.role]}
                {s.chatStatusNote && ` · ${s.chatStatusNote}`}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
