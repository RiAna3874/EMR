"use client";

import Link from "next/link";
import { useActionState } from "react";
import { bookAppointment, type BookState } from "../actions";
import { Button, Field, inputCls } from "@/components/form";

export function BookForm(props: {
  patientId: string;
  providerId: string;
  visitType: string;
  start: string;
  minutes: number;
  reason: string;
  rescheduleId?: string;
  open: boolean;
  summary: string;
  changeHref: string;
}) {
  const [state, action, pending] = useActionState<BookState, FormData>(bookAppointment, undefined);
  const askOverbook = !props.open || state?.overbook;
  return (
    <form action={action} className="space-y-3 p-3">
      <input type="hidden" name="patientId" value={props.patientId} />
      <input type="hidden" name="providerId" value={props.providerId} />
      <input type="hidden" name="visitType" value={props.visitType} />
      <input type="hidden" name="reason" value={props.reason} />
      {props.rescheduleId && <input type="hidden" name="rescheduleId" value={props.rescheduleId} />}
      <div className="flex items-center justify-between gap-3 rounded border border-line bg-panel-muted px-3 py-2">
        <span className="font-medium">{props.summary}</span>
        <Link href={props.changeHref} className="shrink-0 text-[12px] text-accent hover:underline">
          Pick another time
        </Link>
      </div>
      <div className="flex flex-wrap gap-3">
        <Field label="Start">
          <input type="datetime-local" name="start" required step={300} defaultValue={props.start} className={inputCls} />
        </Field>
        <Field label="Length (minutes)">
          <input type="number" name="minutes" required min={5} max={480} step={5} defaultValue={props.minutes} className={`${inputCls} w-28`} />
        </Field>
      </div>
      <Field label="Note for the clinic (optional)">
        <input name="note" placeholder="e.g. needs interpreter, fasting labs" className={inputCls} />
      </Field>
      {askOverbook && (
        <label className="flex items-start gap-2 rounded border border-warn/30 bg-warn-soft px-3 py-2 text-warn">
          <input type="checkbox" name="overbook" className="mt-0.5" />
          <span>This time isn&apos;t open on the provider&apos;s schedule (outside clinic hours, blocked, or already booked). Overbook it anyway.</span>
        </label>
      )}
      {state?.error && (
        <p role="alert" className="text-crit">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {props.rescheduleId ? "Move appointment" : "Schedule"}
      </Button>
    </form>
  );
}
