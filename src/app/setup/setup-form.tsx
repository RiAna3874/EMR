"use client";

import { useActionState } from "react";
import { Button, Field, inputCls } from "@/components/form";
import { MIN_PASSWORD } from "@/lib/accounts";
import { createFirstAdmin } from "./actions";

export function SetupForm({ askToken }: { askToken: boolean }) {
  const [state, action, pending] = useActionState(createFirstAdmin, undefined);
  const v = state?.values ?? {};
  return (
    <form action={action} className="space-y-3 rounded-md border border-line bg-panel p-5 shadow-lg">
      <p className="text-[12.5px] text-ink-2">
        This database has no accounts yet. Create the first administrator. You&apos;ll then add the rest of the staff from Admin → Staff accounts.
      </p>
      {askToken && (
        <Field label="Setup code (MERIDIAN_SETUP_TOKEN)">
          <input name="token" type="password" autoComplete="off" required className={inputCls} />
        </Field>
      )}
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <Field label="Your full name">
          <input name="name" defaultValue={v.name} required className={inputCls} />
        </Field>
        <Field label="Credentials">
          <input name="credentials" defaultValue={v.credentials} placeholder="MD, RN…" className={inputCls} />
        </Field>
      </div>
      <Field label="Your clinical role">
        <select name="role" defaultValue={v.role ?? "physician"} className={inputCls}>
          <option value="physician">Physician</option>
          <option value="resident">Resident</option>
          <option value="nurse">Nurse</option>
          <option value="front_desk">Front desk</option>
        </select>
      </Field>
      <Field label="Username">
        <input name="username" defaultValue={v.username} autoComplete="username" required className={inputCls} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={`Password (${MIN_PASSWORD}+ characters)`}>
          <input name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} className={inputCls} />
        </Field>
        <Field label="Password again">
          <input name="confirm" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} className={inputCls} />
        </Field>
      </div>
      {state?.error && (
        <p role="alert" className="rounded bg-crit-soft px-2 py-1 text-[12.5px] text-crit">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full py-1.5">
        {pending ? "Creating…" : "Create administrator"}
      </Button>
    </form>
  );
}
