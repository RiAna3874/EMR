"use client";

import { useActionState, useState } from "react";
import { Button, Field, inputCls } from "@/components/form";
import { cancelTwoStep, verifyTwoStep } from "../actions";

export function VerifyForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(verifyTwoStep, undefined);
  const [recovery, setRecovery] = useState(false);
  return (
    <div className="rounded-md border border-line bg-panel shadow-lg">
      <form action={action} className="space-y-3 p-5">
        <h1 className="text-[15px] font-semibold">Two-step sign-in</h1>
        <p className="text-[12.5px] text-ink-2">
          {name}, open your authenticator app and enter the 6-digit code shown for <b>Meridian EMR</b>.
        </p>
        <Field label={recovery ? "Recovery code" : "Code"}>
          {recovery ? (
            <input key="r" name="code" autoComplete="off" autoFocus required placeholder="xxxx-xxxx" className={`${inputCls} font-mono`} />
          ) : (
            <input
              key="c"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              autoFocus
              required
              placeholder="123456"
              className={`${inputCls} font-mono text-[16px] tracking-[0.3em]`}
            />
          )}
        </Field>
        {state?.error && (
          <p role="alert" className="rounded bg-crit-soft px-2 py-1 text-[12.5px] text-crit">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="w-full py-1.5">
          {pending ? "Checking…" : "Verify"}
        </Button>
      </form>
      <div className="flex items-center justify-between border-t border-line bg-panel-muted px-5 py-2.5 text-[12px]">
        <button type="button" onClick={() => setRecovery(!recovery)} className="text-accent hover:underline">
          {recovery ? "Use the app code instead" : "Lost your phone? Use a recovery code"}
        </button>
        <form action={cancelTwoStep}>
          <button type="submit" className="text-ink-3 hover:underline">
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}
