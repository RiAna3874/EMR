"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { sendMessage, type ChatState } from "@/app/messages/actions";
import { Button } from "@/components/form";
import { MAX_BODY } from "@/lib/chat/chat";

// Enter sends, Shift+Enter starts a new line. Urgent turns the message red for
// everyone and breaks through muting.
export function Composer({ conversationId, awayNote }: { conversationId: string; awayNote: string | null }) {
  const [state, action, pending] = useActionState<ChatState, FormData>(sendMessage.bind(null, conversationId), undefined);
  const form = useRef<HTMLFormElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const [length, setLength] = useState(0);
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    if (!state?.sent) return;
    form.current?.reset();
    setLength(0);
    setUrgent(false);
    box.current?.focus();
  }, [state?.sent]);

  return (
    <form ref={form} action={action} className={`border-t bg-panel px-4 py-3 ${urgent ? "border-crit" : "border-line"}`}>
      {awayNote && <p className="mb-1.5 text-[12px] text-warn">{awayNote}</p>}
      {state?.error && (
        <p role="alert" className="mb-1.5 text-[12px] text-crit">
          {state.error}
        </p>
      )}
      <textarea
        ref={box}
        name="body"
        rows={2}
        autoFocus
        maxLength={MAX_BODY}
        placeholder="Write a message. Enter to send, Shift+Enter for a new line."
        aria-label="Message"
        onChange={(e) => setLength(e.target.value.length)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (!pending) form.current?.requestSubmit();
          }
        }}
        className={`w-full resize-none rounded border bg-panel px-2.5 py-1.5 text-[13px] outline-none focus:ring-2 ${
          urgent ? "border-crit focus:ring-crit/15" : "border-line focus:border-accent focus:ring-accent/15"
        }`}
      />
      <div className="mt-1.5 flex items-center gap-3">
        <label className={`flex items-center gap-1.5 text-[12px] ${urgent ? "font-semibold text-crit" : "text-ink-2"}`}>
          <input type="checkbox" name="urgent" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
          Urgent
        </label>
        <span className={`tabular text-[11px] ${length > MAX_BODY * 0.9 ? "text-warn" : "text-ink-3"}`}>{length > 0 && `${length}/${MAX_BODY}`}</span>
        <Button type="submit" disabled={pending} className="ml-auto">
          {pending ? "Sending…" : urgent ? "Send urgent" : "Send"}
        </Button>
      </div>
    </form>
  );
}
