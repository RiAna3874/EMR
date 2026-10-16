"use client";

import { inputCls } from "@/components/form";
import { toLocalDate } from "@/lib/format";
import { applyPick, relativeDayLabel, type DatePick } from "@/lib/orders/dates";

export const todayYmd = () => toLocalDate(new Date());

// A date with Epic's one-click picks beside it: Today, Tomorrow, 1 week... Picks count
// from `from` (today for a start date, the start for an end date). `none` adds a
// pick that clears the date, such as "Ongoing" or "No end".
export function DatePicks({
  label,
  value,
  onChange,
  picks,
  from,
  min,
  none,
  disabled,
  name,
  compact,
}: {
  label: string;
  value: string;
  onChange: (ymd: string) => void;
  picks: DatePick[];
  from: string;
  min?: string;
  none?: string;
  disabled?: boolean;
  name?: string;
  compact?: boolean;
}) {
  const today = todayYmd();
  const chip = (on: boolean) =>
    `rounded border px-1.5 leading-5 ${on ? "border-chrome bg-chrome text-white" : "border-line bg-panel text-ink-2 hover:border-accent hover:text-accent"} disabled:opacity-50`;
  return (
    <div className={`flex flex-wrap items-center gap-1 ${compact ? "text-[11px]" : "text-[11.5px]"}`} role="group" aria-label={label}>
      <span className="w-9 shrink-0 text-ink-3">{label}</span>
      <input
        type="date"
        name={name}
        aria-label={`${label} date`}
        value={value}
        min={min}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls} py-0 ${compact ? "text-[11.5px]" : "text-[12px]"}`}
      />
      <span className={`flex flex-wrap gap-1 ${compact ? "basis-full pl-10" : ""}`}>
        {none && (
          <button type="button" disabled={disabled} onClick={() => value && onChange("")} className={chip(!value)} aria-pressed={!value}>
            {none}
          </button>
        )}
        {picks.map((p) => {
          const ymd = applyPick(from, p);
          if (min && ymd < min) return null;
          return (
            <button key={p.label} type="button" disabled={disabled} onClick={() => ymd !== value && onChange(ymd)} className={chip(ymd === value)} aria-pressed={ymd === value} title={relativeDayLabel(ymd, today)}>
              {p.label}
            </button>
          );
        })}
      </span>
    </div>
  );
}
