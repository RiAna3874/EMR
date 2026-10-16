import { db } from "@/lib/db";
import { requirePhonePermission } from "@/lib/phone-session";
import { logChartView } from "@/lib/audit/server";
import { pivot } from "@/lib/chart";
import { isGlucoseCode, mmolToMg } from "@/lib/glucose";
import { fmtShortDate, fmtValue, unitLabel } from "@/lib/format";
import { FlagBadge, flagText } from "@/components/flag";
import { Sparkline } from "@/components/sparkline";
import { PhoneEmpty, PhoneSection } from "@/components/phone/header";

export const metadata = { title: "Vitals" };

// Each vital's latest reading, its trend line and the last few values. Glucose in mmol/L with mg/dL.
const ORDER = ["8480-6", "8462-4", "8867-4", "9279-1", "59408-5", "8310-5", "29463-7", "8302-2", "39156-5"];
const RECENT = 5;

export default async function PhoneVitals({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePhonePermission("viewClinical");
  await logChartView(id, "Vitals (phone)");
  const { rows } = pivot(await db.observation.findMany({ where: { patientId: id, category: "vital_signs" } }));
  const rank = (code: string) => (isGlucoseCode(code) ? 50 : ORDER.indexOf(code) < 0 ? 99 : ORDER.indexOf(code));
  rows.sort((a, b) => rank(a.code) - rank(b.code));
  const show = (o: { code: string; valueNum: number | null; valueText: string | null }) =>
    isGlucoseCode(o.code) && o.valueNum !== null ? o.valueNum.toFixed(1) : fmtValue(o);

  return (
    <PhoneSection title="Vitals">
      {rows.length === 0 && <PhoneEmpty>No vitals recorded.</PhoneEmpty>}
      {rows.map((r) => {
        const recent = [...r.byTime.entries()].sort((a, b) => b[0] - a[0]).slice(0, RECENT);
        const latest = recent[0][1];
        return (
          <div key={r.code} className="border-b border-line px-4 py-3 last:border-b-0">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-medium">{r.display}</span>
              <span className={`tabular font-semibold ${flagText(latest.flag)}`}>
                {show(latest)} <span className="text-[12px] font-normal text-ink-3">{unitLabel(r.unit)}</span>
                <FlagBadge flag={latest.flag} />
              </span>
            </div>
            {isGlucoseCode(r.code) && latest.valueNum !== null && <div className="text-right text-[12px] text-ink-3">{mmolToMg(latest.valueNum)} mg/dL</div>}
            <div className="mt-1 flex items-center gap-3">
              <ol className="tabular flex min-w-0 flex-1 gap-3 overflow-x-auto text-[12px] text-ink-3">
                {recent.map(([t, o]) => (
                  <li key={t} className="shrink-0">
                    <span className={flagText(o.flag) || "text-ink-2"}>{show(o)}</span> <span>{fmtShortDate(new Date(t))}</span>
                  </li>
                ))}
              </ol>
              <Sparkline values={r.values} refLow={r.refLow} refHigh={r.refHigh} />
            </div>
          </div>
        );
      })}
    </PhoneSection>
  );
}
