import { dataNotice } from "@/lib/deployment";

// Shown the instant a screen is tapped, while its data loads, so a tap never seems ignored.
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="mt-4 border-y border-line bg-panel" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="border-b border-line px-4 py-3 last:border-b-0">
          <div className="phone-skeleton h-4" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
          <div className="phone-skeleton mt-2 h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonScreen() {
  return (
    <div role="status" aria-label="Loading">
      <div className="sticky top-0 z-30 bg-chrome pt-[env(safe-area-inset-top)]">
        <div className="flex min-h-12 items-center px-4">
          <div className="h-4 w-40 rounded bg-white/20" />
        </div>
        {dataNotice && <div className="bg-warn py-px text-center text-[10.5px] font-semibold uppercase tracking-wide text-white">{dataNotice.label}</div>}
      </div>
      <div className="px-4 pt-3">
        <div className="phone-skeleton h-10 w-full" />
      </div>
      <SkeletonRows />
    </div>
  );
}

export function PhoneIn({ children }: { children: React.ReactNode }) {
  return <div className="phone-in">{children}</div>;
}
