import { requirePhonePermission } from "@/lib/phone-session";
import { logChartView } from "@/lib/audit/server";
import { SUGAR_TIMINGS, sugarLabel, sugarShort } from "@/lib/labs/groups";
import { mmolToMg } from "@/lib/glucose";
import { fmtDate, fmtTime } from "@/lib/format";
import { FlagBadge, flagText } from "@/components/flag";
import { TrendChart } from "@/components/trend-chart";
import { PhoneEmpty, PhoneSection } from "@/components/phone/header";
import { phoneTrend } from "../results/load";

export const metadata = { title: "Blood sugar" };

// Haiku's blood sugar tab: every lab glucose and fingerstick reading in mmol/L, graphed by
// timing, then each reading newest first.
export default async function PhoneSugar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePhonePermission("viewClinical");
  await logChartView(id, "Blood sugar (phone)");
  const subs = (await phoneTrend(id)).flatMap((s) => s.subs);
  const sugar = subs.find((x) => x.sugar)?.sugar;
  if (!sugar)
    return (
      <PhoneSection>
        <PhoneEmpty>No blood sugar readings on file.</PhoneEmpty>
      </PhoneSection>
    );
  const series = SUGAR_TIMINGS.map((t) => ({
    name: `${t.label} (${t.short})`,
    points: sugar.cells.filter((c) => c.timing === t.key).map((c) => ({ t: c.obs.effectiveAt.getTime(), v: c.mmol, flag: c.flag, imported: c.imported })),
  })).filter((s) => s.points.length);
  return (
    <>
      <Title name="Blood sugar" note="Lab and fingerstick (°) readings in mmol/L. Normal 3.9–7.8; fasting up to 5.5." />
      <div className="border-y border-line bg-panel px-1 py-2">
        <TrendChart series={series} unit="mmol/L" refLow={3.9} refHigh={7.8} height={220} />
      </div>
      <PhoneSection title="Readings">
        {[...sugar.cells].reverse().map((c) => (
          <div key={c.obs.id} className="flex items-baseline gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
            <div className="min-w-0 flex-1">
              <div className="text-[14px]">
                {sugarLabel(c.timing)} <span className="text-ink-3">({sugarShort(c.timing)})</span>
              </div>
              <div className="text-[12.5px] text-ink-3">
                {fmtDate(c.obs.effectiveAt)} {fmtTime(c.obs.effectiveAt)} · {c.source === "fingerstick" ? "fingerstick" : "lab"}
              </div>
            </div>
            <div className={`tabular text-right font-semibold ${flagText(c.flag)}`}>
              {c.mmol.toFixed(1)}
              {c.source === "fingerstick" && <span className="text-ink-3">°</span>}
              <FlagBadge flag={c.flag} />
              <div className="text-[11.5px] font-normal text-ink-3">{mmolToMg(c.mmol)} mg/dL</div>
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
