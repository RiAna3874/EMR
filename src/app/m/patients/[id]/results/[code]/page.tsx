import { notFound, redirect } from "next/navigation";
import { requirePhonePermission } from "@/lib/phone-session";
import { logChartView } from "@/lib/audit/server";
import { fmtDate, fmtRange, fmtTime, fmtValue, unitLabel } from "@/lib/format";
import { FlagBadge, flagText } from "@/components/flag";
import { TrendChart } from "@/components/trend-chart";
import { PhoneSection } from "@/components/phone/header";
import { phoneTrend } from "../load";

export const metadata = { title: "Result trend" };

// One test over time: the graph with its normal range shaded, then every value, newest first.
export default async function PhoneResultTrend({ params }: { params: Promise<{ id: string; code: string }> }) {
  const { id, code: rawCode } = await params;
  const code = safeDecode(rawCode);
  // Blood sugar has its own tab now; older links land there.
  if (code === "sugar") redirect(`/m/patients/${id}/sugar`);
  await requirePhonePermission("viewClinical");
  await logChartView(id, "Results (phone)");
  const subs = (await phoneTrend(id)).flatMap((s) => s.subs);

  const row = subs.flatMap((x) => x.rows).find((r) => r.code === code);
  if (!row) notFound();
  const values = [...row.byTime.entries()].sort((a, b) => b[0] - a[0]);
  const points = values
    .filter(([, o]) => o.valueNum !== null)
    .map(([t, o]) => ({ t, v: o.valueNum!, flag: o.flag }))
    .reverse();
  return (
    <>
      <Title name={row.display} note={[unitLabel(row.unit), fmtRange(row) && `Normal ${fmtRange(row)}`].filter(Boolean).join(" · ")} />
      {points.length > 1 && (
        <div className="border-y border-line bg-panel px-1 py-2">
          <TrendChart series={[{ name: row.display, points }]} unit={unitLabel(row.unit)} refLow={row.refLow} refHigh={row.refHigh} height={220} />
        </div>
      )}
      <PhoneSection title="Values">
        {values.map(([t, o]) => (
          <div key={o.id} className="flex items-baseline gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
            <div className="min-w-0 flex-1 text-[14px]">
              {fmtDate(new Date(t))} <span className="text-ink-3">{fmtTime(new Date(t))}</span>
              {o.correctedAt && <div className="text-[12px] text-warn">Corrected</div>}
            </div>
            <div className={`tabular text-right font-semibold ${flagText(o.flag)}`}>
              {fmtValue(o)}
              <FlagBadge flag={o.flag} />
              {fmtRange(o) && <div className="text-[11.5px] font-normal text-ink-3">{fmtRange(o)}</div>}
            </div>
          </div>
        ))}
      </PhoneSection>
    </>
  );
}

function Title({ name, note }: { name: string; note: string }) {
  return (
    <div className="px-4 pb-2 pt-3">
      <h2 className="text-[17px] font-semibold">{name}</h2>
      {note && <p className="text-[13px] text-ink-3">{note}</p>}
    </div>
  );
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
