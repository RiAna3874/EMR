import Link from "next/link";
import { continueMed, refillMeds } from "@/app/patients/[id]/meds/actions";
import { ContinueButton, RefillButton } from "./refill-button";

const linkCls = "rounded border border-line bg-panel px-2.5 py-0.5 text-[12.5px] font-medium hover:bg-panel-muted";

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

// Medication reconciliation for one medication, on every list it appears in:
// Refill (the same prescription again, into the order basket), Continue (keep taking
// it as it is, no new prescription) and Modify (the prescription form, prefilled).
// Stopped medications offer Refill and Modify to start them again.
export function MedRowActions({
  patientId,
  med,
  inBasket,
  canPend,
  canReview,
  onMedsTab,
}: {
  patientId: string;
  med: { id: string; drug: string; status: string; continuedAt?: Date | null };
  inBasket: boolean;
  canPend: boolean;
  canReview: boolean;
  onMedsTab?: boolean;
}) {
  const meds = `/patients/${patientId}/meds`;
  const modifyHref = `${onMedsTab ? "" : meds}?rx=${med.id}&modify=1#prescribe`;
  const current = med.status === "active" || med.status === "on_hold";
  if (inBasket && canPend)
    return (
      <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
        <Link href={onMedsTab ? "#order-basket" : `${meds}#order-basket`} className="whitespace-nowrap text-[11.5px] font-medium text-warn hover:underline">
          In order basket
        </Link>
        <Link href={modifyHref} className={linkCls}>
          Modify
        </Link>
      </span>
    );
  return (
    <span className="flex shrink-0 flex-wrap items-start justify-end gap-1">
      {canPend && (
        <RefillButton action={refillMeds.bind(null, patientId, [med.id])} signHref={onMedsTab ? undefined : `${meds}#order-basket`} title={`Prescribe ${med.drug} again, unchanged`} />
      )}
      {canReview && current && (
        <ContinueButton
          done={!!med.continuedAt && sameDay(med.continuedAt, new Date())}
          action={continueMed.bind(null, patientId, med.id)}
          title={`Patient keeps taking ${med.drug} as it is; no new prescription`}
        />
      )}
      {canPend && (
        <Link href={modifyHref} className={linkCls} title={`Change the dose or instructions for ${med.drug}`}>
          Modify
        </Link>
      )}
    </span>
  );
}
