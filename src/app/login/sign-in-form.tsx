"use client";

import { useActionState, useEffect, useRef } from "react";
import { clearOpenPatients } from "@/lib/open-patients";
import { Button, Field, inputCls } from "@/components/form";
import { signIn } from "./actions";

type Demo = { username: string; name: string; role: string };

export function SignInForm({ next, demo }: { next: string; demo: Demo[] }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  const user = useRef<HTMLInputElement>(null);
  const pass = useRef<HTMLInputElement>(null);

  // Signed out (or timed out): drop the last user's open chart tabs.
  useEffect(() => clearOpenPatients(), []);

  return (
    <div className="rounded-md border border-line bg-panel shadow-lg">
      <form action={action} className="space-y-3 p-5">
        <h1 className="text-[15px] font-semibold">Sign in</h1>
        <input type="hidden" name="next" value={next} />
        <Field label="Username">
          {/* React resets the form after each attempt; keep the username across a failed one. */}
          <input ref={user} name="username" defaultValue={state?.username} key={state?.username} autoComplete="username" autoFocus required className={inputCls} />
        </Field>
        <Field label="Password">
          <input ref={pass} name="password" type="password" autoComplete="current-password" required className={inputCls} />
        </Field>
        {state?.error && (
          <p role="alert" className="rounded bg-crit-soft px-2 py-1 text-[12.5px] text-crit">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="w-full py-1.5">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      {demo.length > 0 && (
        <div className="border-t border-line bg-panel-muted px-5 py-3">
          <p className="mb-1.5 text-[11.5px] text-ink-3">
            Demo accounts (password <code className="font-mono">meridian</code>). Pick one to fill the form.
          </p>
          <ul className="space-y-0.5">
            {demo.map((d) => (
              <li key={d.username}>
                <button
                  type="button"
                  onClick={() => {
                    if (user.current) user.current.value = d.username;
                    if (pass.current) pass.current.value = "meridian";
                    pass.current?.form?.requestSubmit();
                  }}
                  className="flex w-full items-baseline justify-between gap-2 rounded px-1.5 py-1 text-left hover:bg-accent-soft"
                >
                  <span className="font-medium text-accent">{d.name}</span>
                  <span className="text-[11.5px] text-ink-3">{d.role}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
