"use client";

import { useActionState } from "react";
import { Button, Field, inputCls } from "@/components/form";
import { unlockScreen } from "./actions";

export function UnlockForm({ next, username }: { next: string; username: string }) {
  const [state, action, pending] = useActionState(unlockScreen, undefined);
  return (
    <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name="next" value={next} />
      {/* For password managers. */}
      <input type="hidden" name="username" value={username} autoComplete="username" />
      <Field label="Password">
        <input name="password" type="password" autoComplete="current-password" autoFocus required className={inputCls} />
      </Field>
      {state?.error && (
        <p role="alert" className="rounded bg-crit-soft px-2 py-1 text-[12.5px] text-crit">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full py-1.5">
        {pending ? "Unlocking…" : "Unlock"}
      </Button>
    </form>
  );
}
