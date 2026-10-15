"use client";

import { useActionState } from "react";
import { sendVisitPrescription, type TextState } from "@/app/patients/[id]/texts/actions";
import { Button } from "@/components/form";
import { smsParts } from "@/lib/sms/sms";

// "Send prescription by SMS" on the Visit tab: shows the exact text first, then sends it.
export function SendRxText({ patientId, encounterId, text, to, blocked, sentAt }: { patientId: string; encounterId: string; text: string | null; to: string | null; blocked: string | null; sentAt: string | null }) {
  const [state, action, pending] = useActionState<TextState, FormData>(sendVisitPrescription.bind(null, patientId, encounterId), undefined);
  const parts = text ? smsParts(text) : null;
  return (
    <details className="rounded border border-line bg-panel text-[12.5px] open:pb-2">
      <summary className="cursor-pointer list-none px-2.5 py-1 text-center font-medium hover:bg-panel-muted">Send prescription by SMS</summary>
      <div className="space-y-2 px-2.5 pt-2">
        {blocked ? (
          <p className="text-ink-2">{blocked}</p>
        ) : (
          <>
            <p className="text-ink-3">
              To <span className="tabular text-ink">{to}</span> · {parts?.parts} SMS{parts?.unicode ? " (Bangla)" : ""}
            </p>
            <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded bg-panel-muted p-2 font-sans text-[12px] leading-snug">{text}</pre>
            {sentAt && !state?.sent && <p className="text-ink-3">Already sent at {sentAt}. Sending again sends it again.</p>}
            <form action={action}>
              <Button type="submit" disabled={pending} className="w-full">
                {pending ? "Sending…" : sentAt ? "Send again" : "Send to patient"}
              </Button>
            </form>
          </>
        )}
        {state?.error && (
          <p role="alert" className="text-crit">
            {state.error}
          </p>
        )}
        {state?.sent && (state.logged ? <p className="text-warn">Saved on the Texts tab. Not sent: no SMS gateway yet.</p> : <p className="text-ok">Sent. Check the Texts tab for delivery.</p>)}
      </div>
    </details>
  );
}
