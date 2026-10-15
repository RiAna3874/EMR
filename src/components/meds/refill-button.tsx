"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/form";
import type { RefillResult } from "@/app/patients/[id]/meds/actions";

// One click puts the same prescription in the order basket; says what happened and
// where to sign it when the basket isn't on this page.
export function RefillButton({
  action,
  signHref,
  variant = "secondary",
  title,
  children = "Refill",
}: {
  action: () => Promise<RefillResult>;
  signHref?: string;
  variant?: "primary" | "secondary" | "ghost";
  title?: string;
  children?: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<RefillResult | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <Button
        type="button"
        variant={variant}
        disabled={pending}
        title={title}
        className="py-0.5"
        onClick={() =>
          start(async () => {
            setResult(await action());
          })
        }
      >
        {pending ? "Adding…" : children}
      </Button>
      {result?.error && (
        <span role="alert" className="max-w-72 text-right text-[11.5px] text-warn">
          {result.error}
        </span>
      )}
      {result?.added && signHref && (
        <span role="status" className="max-w-72 text-right text-[11.5px] text-ok">
          In the order basket.{" "}
          <Link href={signHref} className="font-medium text-accent hover:underline">
            Review and sign
          </Link>
        </span>
      )}
    </span>
  );
}

// Continue toggles: pressed today it reads "Continued", and pressing it again undoes it.
export function ContinueButton({ done, action, title }: { done: boolean; action: (on: boolean) => Promise<void>; title?: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant={done ? "primary" : "secondary"}
      disabled={pending}
      aria-pressed={done}
      title={done ? "Continued today. Click to undo." : title}
      className="py-0.5"
      onClick={() => start(() => action(!done))}
    >
      {done ? "✓ Continued" : "Continue"}
    </Button>
  );
}
