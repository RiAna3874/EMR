"use client";

import { useTransition } from "react";
import { Button } from "@/components/form";

// A button that runs a bound server action, optionally after a confirm prompt.
export function ActionButton({
  action,
  confirm: question,
  variant = "secondary",
  className,
  children,
}: {
  action: () => Promise<unknown>;
  confirm?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
  children: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant={variant}
      className={className}
      disabled={pending}
      onClick={() => {
        if (question && !window.confirm(question)) return;
        start(async () => {
          await action();
        });
      }}
    >
      {children}
    </Button>
  );
}
