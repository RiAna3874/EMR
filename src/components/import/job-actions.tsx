"use client";

import { useTransition } from "react";
import { discardImport, enterManually, rereadAs, retryExtraction } from "@/app/patients/[id]/import/actions";
import { Button } from "@/components/form";

export function JobActions({ patientId, jobId, canRetry, manualLabel }: { patientId: string; jobId: string; canRetry: boolean; manualLabel: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="mt-5 flex justify-center gap-2">
      {canRetry && (
        <Button disabled={pending} onClick={() => start(() => retryExtraction(patientId, jobId))}>
          Try again
        </Button>
      )}
      <Button variant="secondary" disabled={pending} onClick={() => start(() => enterManually(patientId, jobId))}>
        {manualLabel}
      </Button>
      <Button
        variant="danger"
        disabled={pending}
        onClick={() => {
          if (confirm("Discard this import? Nothing from it will be filed.")) start(() => discardImport(patientId, jobId));
        }}
      >
        Discard
      </Button>
    </div>
  );
}

// Switches an import between lab results and a clinical document, and reads it again.
export function RereadButton({ patientId, jobId, kind }: { patientId: string; jobId: string; kind: "lab" | "document" }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="ml-auto text-[12px] text-accent hover:underline disabled:opacity-50"
      disabled={pending}
      onClick={() => {
        if (confirm(`Read these pages again as ${kind === "lab" ? "lab results" : "a clinical document"}? Edits made so far are dropped.`)) start(() => rereadAs(patientId, jobId, kind));
      }}
    >
      {pending ? "Starting…" : kind === "lab" ? "Read as lab results instead" : "Read as a clinical document instead"}
    </button>
  );
}
