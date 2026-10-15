"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { sendPatientText, type TextState } from "@/app/patients/[id]/texts/actions";
import { Button } from "@/components/form";
import { MANUAL_MAX, manualText, smsParts, type SmsLang } from "@/lib/sms/sms";

// Ready-made texts in the patient's language. None names a diagnosis or a result.
const QUICK: Record<SmsLang, { label: string; text: string }[]> = {
  en: [
    { label: "Report ready", text: "Your report is ready. Please collect it from the clinic." },
    { label: "Results back", text: "Your test results are back. Please call or visit the clinic to discuss them." },
    { label: "Follow-up due", text: "Your follow-up visit is due. Please call the clinic to book a time." },
    { label: "Prescription ready", text: "Your prescription is ready. Please collect it from the clinic." },
  ],
  bn: [
    { label: "রিপোর্ট প্রস্তুত", text: "আপনার রিপোর্ট প্রস্তুত। ক্লিনিক থেকে সংগ্রহ করুন।" },
    { label: "ফলাফল এসেছে", text: "আপনার পরীক্ষার ফলাফল এসেছে। আলোচনার জন্য ক্লিনিকে ফোন করুন বা আসুন।" },
    { label: "ফলো-আপ", text: "আপনার ফলো-আপ ভিজিটের সময় হয়েছে। সময় নিতে ক্লিনিকে ফোন করুন।" },
    { label: "প্রেসক্রিপশন প্রস্তুত", text: "আপনার প্রেসক্রিপশন প্রস্তুত। ক্লিনিক থেকে সংগ্রহ করুন।" },
  ],
};

export function TextComposer({ patientId, sender, lang, to }: { patientId: string; sender: string; lang: SmsLang; to: string }) {
  const [state, action, pending] = useActionState<TextState, FormData>(sendPatientText.bind(null, patientId), undefined);
  const form = useRef<HTMLFormElement>(null);
  const [body, setBody] = useState("");
  const parts = smsParts(body.trim() ? manualText(body, sender) : "");

  useEffect(() => {
    if (!state?.sent) return;
    form.current?.reset();
    setBody("");
  }, [state]);

  return (
    <form ref={form} action={action} className="space-y-2 p-3">
      <div className="flex flex-wrap gap-1.5">
        {[...QUICK[lang], ...(lang === "bn" ? QUICK.en : [])].map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => setBody(q.text)}
            className="rounded-full border border-line px-2.5 py-0.5 text-[12px] text-ink-2 hover:border-accent hover:text-accent"
          >
            {q.label}
          </button>
        ))}
      </div>
      <textarea
        name="body"
        rows={3}
        maxLength={MANUAL_MAX}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={`Text to ${to}. Keep it short and leave out diagnoses: anyone holding the phone can read it.`}
        aria-label="Text message"
        className="w-full resize-y rounded border border-line bg-panel px-2.5 py-1.5 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
      />
      <div className="flex items-center gap-3 text-[11.5px] text-ink-3">
        {body.trim() ? (
          <span className="tabular">
            Starts with &ldquo;{sender}:&rdquo; · {parts.length} characters · {parts.parts} SMS{parts.unicode ? " (Bangla text uses more SMS)" : ""}
          </span>
        ) : (
          <span>Starts with &ldquo;{sender}:&rdquo; so the patient knows who it&apos;s from.</span>
        )}
        {state?.error && (
          <span role="alert" className="text-crit">
            {state.error}
          </span>
        )}
        {state?.sent && !body && <span className="text-ok">Sent.</span>}
        <Button type="submit" disabled={pending || !body.trim()} className="ml-auto">
          {pending ? "Sending…" : "Send text"}
        </Button>
      </div>
    </form>
  );
}
