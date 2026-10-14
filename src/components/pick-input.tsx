"use client";

import { useId, useMemo, useState } from "react";
import { inputCls } from "@/components/form";
import { matchesPick, type PickOption } from "@/lib/meds/dosing";

// A text box with a searchable list under it. Typing filters the list (by value,
// hint or keywords, so "bid" finds "twice daily"); arrows and Enter pick, and
// anything typed that isn't on the list is kept as is.
export function PickInput({
  value,
  onChange,
  options,
  name,
  placeholder,
  className = "",
  ariaLabel,
  showAllOnFocus = true,
  autoFocus,
  required,
  onBlur,
}: {
  value: string;
  onChange: (value: string, picked?: PickOption) => void;
  options: PickOption[];
  name?: string;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  showAllOnFocus?: boolean;
  autoFocus?: boolean;
  required?: boolean;
  onBlur?: () => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null); // null until typed since focus
  const [active, setActive] = useState(0);

  const shown = useMemo(() => {
    const q = query ?? "";
    if (!q && !showAllOnFocus) return [];
    return options.filter((o) => matchesPick(o, q)).slice(0, 30);
  }, [options, query, showAllOnFocus]);

  const pick = (o: PickOption) => {
    onChange(o.value, o);
    setOpen(false);
    setQuery(null);
  };

  return (
    <div className={`relative ${className}`}>
      <input
        name={name}
        value={value}
        required={required}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open && shown.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        className={`${inputCls} w-full`}
        onFocus={() => {
          setOpen(true);
          setQuery(null);
          setActive(0);
        }}
        onBlur={() => {
          setOpen(false);
          onBlur?.();
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) setOpen(true);
            else setActive((i) => Math.min(i + 1, shown.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && open && shown[active]) {
            e.preventDefault();
            pick(shown[active]);
          } else if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          } else if (e.key === "Tab" && open && query && shown[active] && shown[active].value !== value) {
            // Tab takes the highlighted match only when the person has typed to search.
            pick(shown[active]);
          }
        }}
      />
      {open && shown.length > 0 && (
        <ul id={listId} role="listbox" className="absolute left-0 top-full z-30 mt-1 max-h-64 min-w-full overflow-y-auto rounded border border-line bg-panel py-0.5 shadow-lg">
          {shown.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o)}
              className={`flex cursor-pointer items-baseline gap-3 whitespace-nowrap px-2.5 py-1 text-[13px] ${i === active ? "bg-accent-soft" : ""} ${o.value === value ? "font-semibold" : ""}`}
            >
              <span className="flex-1">{o.value}</span>
              {o.hint && <span className="text-[11.5px] text-ink-3">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
