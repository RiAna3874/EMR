import Link from "next/link";
import { refillMeds } from "@/app/patients/[id]/meds/actions";
import { RefillButton } from "./refill-button";

const linkCls = "rounded border border-line bg-panel px-2.5 py-0.5 text-[12.5px] font-medium hover:bg-panel-muted";

// Refill and Modify for one current medication, for lists outside the Meds tab.
// Modify opens the prescription form on the Meds tab, prefilled.
export function MedRowActions({
  patientId,
  med,
  inBasket,
}: {
  patientId: string;
  med: { id: string; drug: string; rxClass: string };
  inBasket: boolean;
}) {
  const meds = `/patients/${patientId}/meds`;
  if (inBasket)
    return (
      <Link href={`${meds}#order-basket`} className="whitespace-nowrap text-[11.5px] font-medium text-warn hover:underline">
        In order basket, sign
      </Link>
    );
  if (med.rxClass === "historical")
    return (
      <Link href={`${meds}?rx=${med.id}#prescribe`} className={linkCls} title={`Write ${med.drug} as a prescription here`}>
        Prescribe
      </Link>
    );
  return (
    <span className="flex shrink-0 items-start gap-1">
      <RefillButton action={refillMeds.bind(null, patientId, [med.id])} signHref={`${meds}#order-basket`} title={`Same prescription of ${med.drug} again`} />
      <Link href={`${meds}?rx=${med.id}&modify=1#prescribe`} className={linkCls} title={`Change the dose or instructions for ${med.drug}`}>
        Modify
      </Link>
    </span>
  );
}
