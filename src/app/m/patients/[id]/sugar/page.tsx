import { requirePhonePermission } from "@/lib/phone-session";
import { can } from "@/lib/roles";
import { logChartView } from "@/lib/audit/server";
import { loadBloodSugar, type SugarDayCell } from "@/lib/labs/sugar-load";
import { sugarLabel, sugarShort } from "@/lib/labs/groups";
import { mmolToMg } from "@/lib/glucose";
import { fmtDate, fmtDayShort, fmtTime, toLocalDate } from "@/lib/format";
import { FlagBadge, flagText } from "@/components/flag";
import { TrendChart } from "@/components/trend-chart";
import { PhoneEmpty, PhoneSection } from "@/components/phone/header";
import { AddSugarNote, SugarNote } from "@/components/sugar-note";

export const metadata = { title: "Blood sugar" };

const MAX_DAYS = 31;

// Haiku's blood sugar tab, matching the full site: a graph of fasting and 2 hours after
// breakfast, then one card per day with both readings side by side and the day's note.
export default async function PhoneSugar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePhonePermission("viewClinical");
  await logChartView(id, "Blood sugar (phone)");
  const { cells, days, others } = await loadBloodSugar(id);
  const canNote = can(user.role, "recordVitals");
  const today = toLocalDate(new Date());
  if (cells.length === 0 && days.length === 0)
    return (
      <PhoneSection>
        <PhoneEmpty>No blood sugar readings on file.</PhoneEmpty>
        {canNote && (
          <div className="px-4 py-3">
            <AddSugarNote patientId={id} today={today} phone />
          </div>
        )}
      </PhoneSection>
    );
  const series = [
    { name: "Fasting (FBS)", points: days.flatMap((d) => (d.fasting ? [d.fasting] : [])) },
    { name: "2h after breakfast", points: days.flatMap((d) => (d.afterBreakfast ? [d.afterBreakfast] : [])) },
  ]
    .map((s) => ({ ...s, points: s.points.reverse().map((c) => ({ t: c.obs.effectiveAt.getTime(), v: c.mmol, flag: c.flag, imported: c.imported })) }))
    .filter((s) => s.points.length);
  const reading = (label: string, c: SugarDayCell | undefined) => (
    <div className="min-w-0 flex-1">
      <div className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">{label}</div>
      {c ? (
        <>
          <div className={`tabular text-[18px] font-semibold ${flagText(c.flag)}`}>
            {c.mmol.toFixed(1)}
            {c.source === "fingerstick" && <span className="text-ink-3">°</span>}
            <FlagBadge flag={c.flag} />
          </div>
          <div className="tabular text-[12px] text-ink-3">
            {mmolToMg(c.mmol)} mg/dL · {fmtTime(c.obs.effectiveAt)}
          </div>
        </>
      ) : (
        <div className="text-[18px] text-ink-3">—</div>
      )}
    </div>
  );
  return (
    <>
      <Title name="Blood sugar" note="Fasting and 2 hours after breakfast in mmol/L, from labs and Vitals (°). Normal fasting up to 5.5; after breakfast up to 7.8." />
      {series.length > 0 && (
        <div className="border-y border-line bg-panel px-1 py-2">
          <TrendChart marks={[{ v: 5.5, label: "Fasting limit 5.5" }]} series={series} unit="mmol/L" refLow={3.9} refHigh={7.8} height={220} />
        </div>
      )}
      <PhoneSection title="By day">
        {canNote && (
          <div className="border-b border-line px-4 py-2.5">
            <AddSugarNote patientId={id} today={today} phone />
          </div>
        )}
        {days.slice(0, MAX_DAYS).map((d) => (
          <div key={d.day} className="border-b border-line px-4 py-2.5 last:border-b-0">
            <div className="flex items-baseline">
              <div className="text-[14px] font-semibold">{fmtDayShort(new Date(`${d.day}T12:00:00`))}</div>
              {d.rise !== undefined && (
                <div className="tabular ml-auto text-[12px] text-ink-3">
                  Rise {d.rise > 0 ? "+" : ""}
                  {d.rise.toFixed(1)}
                </div>
              )}
            </div>
            <div className="mt-1 flex gap-3">
              {reading("Fasting", d.fasting)}
              {reading("2h after breakfast", d.afterBreakfast)}
            </div>
            {(d.note || canNote) && (
              <div className="mt-1.5">
                <SugarNote patientId={id} day={d.day} text={d.note?.text} canEdit={canNote} phone />
              </div>
            )}
          </div>
        ))}
      </PhoneSection>
      {others.length > 0 && (
        <PhoneSection title={`Other readings (${others.length})`}>
          {others.map((c) => (
            <div key={c.obs.id} className="flex items-baseline gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="text-[14px]">
                  {sugarLabel(c.timing)} <span className="text-ink-3">({sugarShort(c.timing)})</span>
                </div>
                <div className="text-[12.5px] text-ink-3">
                  {fmtDate(c.obs.effectiveAt)} {fmtTime(c.obs.effectiveAt)} · {c.source === "fingerstick" ? "Vitals" : "lab"}
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
      )}
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
