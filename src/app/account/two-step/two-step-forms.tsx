"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, Field, inputCls } from "@/components/form";
import { confirmTwoStep, newCodes, turnOffTwoStep, type TwoStepState } from "./actions";

const codeInput = (
  <input
    name="code"
    inputMode="numeric"
    autoComplete="one-time-code"
    pattern="[0-9 ]{6,7}"
    maxLength={7}
    required
    placeholder="123456"
    className={`${inputCls} w-36 font-mono text-[15px] tracking-[0.25em]`}
  />
);

function ErrorLine({ state }: { state: TwoStepState }) {
  return state?.error ? (
    <p role="alert" className="rounded bg-crit-soft px-2 py-1 text-[12.5px] text-crit">
      {state.error}
    </p>
  ) : null;
}

// Shown once, right after they're made. Only their hashes are stored.
function RecoveryCodes({ codes, done }: { codes: string[]; done?: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-md border border-line bg-panel p-5">
      <h2 className="text-[14px] font-semibold">Save your recovery codes</h2>
      <p className="text-[12.5px] text-ink-2">
        If you lose your phone, each of these lets you sign in once. Write them down or print this page and keep it somewhere safe, away from your phone. They
        won&apos;t be shown again.
      </p>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1 rounded border border-line bg-panel-muted px-4 py-3 font-mono text-[14px]">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex gap-2 print:hidden">
        <Button type="button" variant="secondary" onClick={() => window.print()}>
          Print
        </Button>
        {done}
      </div>
    </div>
  );
}

export function SetUpTwoStep({ qr, secret }: { qr: string; secret: string }) {
  const [state, action, pending] = useActionState(confirmTwoStep, undefined);
  if (state?.codes)
    return (
      <RecoveryCodes
        codes={state.codes}
        done={
          <Link href="/" className="rounded border border-accent bg-accent px-2.5 py-1 text-[12.5px] font-medium text-white hover:bg-accent/90">
            I&apos;ve saved them, continue
          </Link>
        }
      />
    );
  return (
    <form action={action} className="space-y-4 rounded-md border border-line bg-panel p-5">
      <ol className="list-decimal space-y-1 pl-5 text-[12.5px] text-ink-2">
        <li>
          Install an authenticator app on your phone if you don&apos;t have one: <b>Google Authenticator</b> or <b>Microsoft Authenticator</b> (free, Android and
          iPhone).
        </li>
        <li>In the app, add an account and scan this code.</li>
        <li>Type the 6-digit code the app shows for Meridian EMR.</li>
      </ol>
      <div className="flex flex-wrap items-start gap-5">
        {/* Generated on the server from this account's own secret. */}
        <div className="h-44 w-44 shrink-0 rounded border border-line bg-white p-1" dangerouslySetInnerHTML={{ __html: qr }} />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="text-[12px] text-ink-3">
            Can&apos;t scan? Choose &ldquo;enter a setup key&rdquo; in the app and type:
            <code className="mt-1 block break-all rounded bg-panel-muted px-2 py-1 font-mono text-[13px] text-ink">{secret}</code>
          </div>
          <Field label="Code from the app">{codeInput}</Field>
          <ErrorLine state={state} />
          <Button type="submit" disabled={pending}>
            {pending ? "Checking…" : "Turn on two-step sign-in"}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function ManageTwoStep({ since, codesLeft, canTurnOff }: { since: string; codesLeft: number; canTurnOff: boolean }) {
  const [codesState, codesAction, codesPending] = useActionState(newCodes, undefined);
  const [offState, offAction, offPending] = useActionState(turnOffTwoStep, undefined);
  if (codesState?.codes) return <RecoveryCodes codes={codesState.codes} />;
  if (offState?.ok) return <p className="rounded-md bg-accent-soft px-3 py-2 text-accent">{offState.ok}</p>;
  return (
    <div className="space-y-4">
      <p className="rounded-md border border-ok/30 bg-ok/10 px-3 py-2 text-[12.5px] text-ok">
        On since {since}. You sign in with your password and a code from your phone. {codesLeft} recovery {codesLeft === 1 ? "code" : "codes"} left.
      </p>
      <form action={codesAction} className="space-y-2 rounded-md border border-line bg-panel p-5">
        <h2 className="text-[14px] font-semibold">New recovery codes</h2>
        <p className="text-[12.5px] text-ink-2">Makes ten new codes. The old ones stop working.</p>
        <Field label="Code from the app">{codeInput}</Field>
        <ErrorLine state={codesState} />
        <Button type="submit" variant="secondary" disabled={codesPending}>
          Make new codes
        </Button>
      </form>
      <p className="text-[12px] text-ink-3">New phone? Ask an administrator to reset your two-step sign-in, then set it up again at your next sign-in.</p>
      {canTurnOff && (
        <form action={offAction} className="space-y-2 rounded-md border border-line bg-panel p-5">
          <h2 className="text-[14px] font-semibold">Turn off</h2>
          <Field label="Your password">
            <input name="password" type="password" autoComplete="current-password" required className={inputCls} />
          </Field>
          <ErrorLine state={offState} />
          <Button type="submit" variant="danger" disabled={offPending}>
            Turn off two-step sign-in
          </Button>
        </form>
      )}
    </div>
  );
}
