import Link from "next/link";
import { requirePhonePermission } from "@/lib/phone-session";
import { logChartView } from "@/lib/audit/server";
import { sugarShort } from "@/lib/labs/groups";
import { fmtShortDate, fmtValue, unitLabel } from "@/lib/format";
import { FlagBadge, flagText } from "@/components/flag";
import { Sparkline } from "@/components/sparkline";
import { PhoneEmpty, PhoneSection, RowLink } from "@/components/phone/header";
import { phoneTrend } from "./load";

export const metadata = { title: "Results" };

// Haiku's results: each test's latest value with its trend line, grouped like the full
// site's trend table (Diabetes, Hematology, Chemistry...). Tap a test for its graph and history.
export default async function PhoneResults({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ abn?: string }> }) {
  const { id } = await params;
  const abnormalOnly = (await searchParams).abn === "1";
  await requirePhonePermission("viewClinical");
  await logChartView(id, "Results (phone)");
  const base = `/m/patients/${id}/results`;
  const sections = await phoneTrend(id);
  const latest = <T,>(m: Map<number, T>) => [...m.entries()].sort((a, b) => b[0] - a[0])[0];
  const flagged = (f: string | null | undefined) => !!f && f !== "N";

  const shown = sections
    .map((s) => ({
      ...s,
      subs: s.subs
        .map((x) => ({
          ...x,
          rows: abnormalOnly ? x.rows.filter((r) => flagged(latest(r.byTime)?.[1].flag)) : x.rows,
          sugar: x.sugar && (!abnormalOnly || flagged(x.sugar.cells.at(-1)?.flag)) ? x.sugar : undefined,
        }))
        .filter((x) => x.rows.length || x.sugar),
    }))
    .filter((s) => s.subs.length);

  return (
    <>
      <div className="flex gap-2 px-4 pt-3">
        <Link href={base} className={pill(!abnormalOnly)}>
          All tests
        </Link>
        <Link href={`${base}?abn=1`} className={pill(abnormalOnly)}>
          Abnormal only
        </Link>
      </div>
      {shown.length === 0 && (
        <PhoneSection>
          <PhoneEmpty>{abnormalOnly ? "No tests with an out-of-range latest result." : "No lab results on file."}</PhoneEmpty>
        </PhoneSection>
      )}
      {shown.map((s) => (
        <PhoneSection key={s.key} title={s.label} action={s.abnormal > 0 && <span className="text-[12px] font-semibold text-high">{s.abnormal} out of range</span>}>
          {s.subs.map((x) => (
            <div key={x.key}>
              {s.subs.length > 1 && <h3 className="border-b border-line bg-panel-muted px-4 py-1 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">{x.label}</h3>}
              {x.sugar &&
                (() => {
                  const last = x.sugar.cells.at(-1)!;
                  return (
                    <RowLink href={`${base}/sugar`}>
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-medium">Blood sugar</span>
                        <span className={`tabular shrink-0 font-semibold ${flagText(last.flag)}`}>
                          {last.mmol.toFixed(1)}
                          {last.source === "fingerstick" && <span className="text-ink-3">°</span>}
                          <span className="ml-0.5 text-[10.5px] text-ink-3">{sugarShort(last.timing)}</span>
                          <FlagBadge flag={last.flag} />
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[12.5px] text-ink-3">
                        <span>mmol/L · {fmtShortDate(last.obs.effectiveAt)}</span>
                        <Sparkline values={x.sugar.cells.map((c) => c.mmol)} refLow={3.9} refHigh={7.8} />
                      </div>
                    </RowLink>
                  );
                })()}
              {x.rows.map((r) => {
                const [t, o] = latest(r.byTime);
                return (
                  <RowLink key={r.code} href={`${base}/${encodeURIComponent(r.code)}`}>
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">{r.display}</span>
                      <span className={`tabular shrink-0 font-semibold ${flagText(o.flag)}`}>
                        {fmtValue(o)}
                        <FlagBadge flag={o.flag} />
                        {o.correctedAt && <span className="ml-0.5 text-[10.5px] font-bold text-warn">C</span>}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[12.5px] text-ink-3">
                      <span className="truncate">
                        {unitLabel(r.unit)}
                        {r.unit ? " · " : ""}
                        {fmtShortDate(new Date(t))}
                      </span>
                      <Sparkline values={r.values} refLow={r.refLow} refHigh={r.refHigh} />
                    </div>
                  </RowLink>
                );
              })}
            </div>
          ))}
        </PhoneSection>
      ))}
    </>
  );
}

const pill = (on: boolean) => `rounded-full border px-3 py-1.5 text-[13px] font-medium ${on ? "border-chrome bg-chrome text-white" : "border-line bg-panel text-ink-2"}`;
