"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// The Results tab's search box: filters as you type (the page reads ?q=), keeping the view
// you're on. Esc clears it.
export function ResultsSearchBox({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(initial);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      for (const k of ["q", "report", "correct", "corrected"]) next.delete(k);
      if (q.trim()) next.set("q", q.trim());
      const s = next.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    }, 250);
    return () => clearTimeout(timer);
    // Only typing should trigger a search, not the URL change it causes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="relative">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setQ("")}
        placeholder="Search results: test, value, panel, lab…"
        aria-label="Search results"
        className="w-80 rounded border border-line bg-panel px-2.5 py-1 text-[12.5px] outline-none focus:border-accent"
      />
    </div>
  );
}
