"use client";

import { useTransition } from "react";
import { discardImport, enterManually, retryExtraction } from "@/app/patients/[id]/import/actions";
import { Button } from "@/components/form";

export function JobActions({ patientId, jobId, canRetry }: { patientId: string; jobId: string; canRetry: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="mt-5 flex justify-center gap-2">
      {canRetry && (
        <Button disabled={pending} onClick={() => start(() => retryExtraction(patientId, jobId))}>
          Try again
        </Button>
      )}
      <Button variant="secondary" disabled={pending} onClick={() => start(() => enterManually(patientId, jobId))}>
        Enter results by hand
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
