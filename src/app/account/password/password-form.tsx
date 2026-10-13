"use client";

import { useActionState } from "react";
import { Button, Field, inputCls } from "@/components/form";
import { MIN_PASSWORD } from "@/lib/accounts";
import { changePassword } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);
  return (
    <form action={action} className="space-y-3 rounded-md border border-line bg-panel p-5">
      <Field label="Current password">
        <input name="current" type="password" autoComplete="current-password" required className={inputCls} />
      </Field>
      <Field label={`New password (${MIN_PASSWORD}+ characters)`}>
        <input name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} className={inputCls} />
      </Field>
      <Field label="New password again">
        <input name="confirm" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} className={inputCls} />
      </Field>
      {state?.error && (
        <p role="alert" className="rounded bg-crit-soft px-2 py-1 text-[12.5px] text-crit">
          {state.error}
        </p>
      )}
      {state?.done && <p className="rounded bg-accent-soft px-2 py-1 text-[12.5px] text-accent">Password changed. You&apos;re signed out on other devices.</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}
