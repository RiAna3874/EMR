import Link from "next/link";
import { requirePhonePermission } from "@/lib/phone-session";
import { logChartView } from "@/lib/audit/server";
import { matchesTokens, obsHaystack, queryTokens } from "@/lib/labs/result-search";
import { fmtShortDate, fmtValue, unitLabel } from "@/lib/format";
import { FlagBadge, flagText } from "@/components/flag";
import { Sparkline } from "@/components/sparkline";
import { PhoneEmpty, PhoneSection, RowLink } from "@/components/phone/header";
import { phoneTrend } from "./load";

export const metadata = { title: "Results" };

// Haiku's results: each test's latest value with its trend line, grouped like the full
// site's trend table (Diabetes, Hematology, Chemistry...). Tap a test for its graph and history.
export default async function PhoneResults({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ abn?: string; q?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const abnormalOnly = sp.abn === "1";
  const tokens = queryTokens(sp.q);
  await requirePhonePermission("viewClinical");
  await logChartView(id, "Results (phone)");
  const base = `/m/patients/${id}/results`;
  const sections = await phoneTrend(id, { sugar: false });
  const latest = <T,>(m: Map<number, T>) => [...m.entries()].sort((a, b) => b[0] - a[0])[0];
  const flagged = (f: string | null | undefined) => !!f && f !== "N";

  const shown = sections
    .map((s) => ({
      ...s,
      subs: s.subs
        .map((x) => ({
          ...x,
          rows: x.rows
            .filter((r) => !abnormalOnly || flagged(latest(r.byTime)?.[1].flag))
            .filter((r) => !tokens.length || matchesTokens([...r.byTime.values()].map((o) => obsHaystack(o, [x.label, s.label])).join(" | "), tokens)),
        }))
        .filter((x) => x.rows.length),
    }))
    .filter((s) => s.subs.length);

  return (
    <>
      <form action={base} className="px-4 pt-3">
        {abnormalOnly && <input type="hidden" name="abn" value="1" />}
        <input
          type="search"
          name="q"
          defaultValue={sp.q}
          placeholder="Search results: test, value, panel…"
          aria-label="Search results"
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-[15px] outline-none focus:border-accent"
        />
      </form>
      <div className="flex gap-2 px-4 pt-2">
        <Link href={sp.q ? `${base}?q=${encodeURIComponent(sp.q)}` : base} className={pill(!abnormalOnly)}>
          All tests
        </Link>
        <Link href={`${base}?abn=1${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`} className={pill(abnormalOnly)}>
          Abnormal only
        </Link>
      </div>
      {shown.length === 0 && (
        <PhoneSection>
          <PhoneEmpty>{tokens.length ? `Nothing in the results matches “${sp.q}”.` : abnormalOnly ? "No tests with an out-of-range latest result." : "No lab results on file."}</PhoneEmpty>
        </PhoneSection>
      )}
      {shown.map((s) => (
        <PhoneSection key={s.key} title={s.label} action={s.abnormal > 0 && <span className="text-[12px] font-semibold text-high">{s.abnormal} out of range</span>}>
          {s.subs.map((x) => (
            <div key={x.key}>
              {s.subs.length > 1 && <h3 className="border-b border-line bg-panel-muted px-4 py-1 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">{x.label}</h3>}
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
