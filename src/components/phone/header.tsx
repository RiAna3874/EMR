import Link from "next/link";
import { dataNotice } from "@/lib/deployment";
import { BackButton } from "./back-button";

// The phone view's top bar: a back arrow, the screen's title and an optional action.
// Pads for the notch when the view is installed to the home screen.
// sticky: false when a parent keeps it on screen together with something below it (the chart tabs).
export function PhoneHeader({ title, sub, back, action, sticky = true }: { title: React.ReactNode; sub?: React.ReactNode; back?: string; action?: React.ReactNode; sticky?: boolean }) {
  return (
    <header className={`${sticky ? "sticky top-0 z-30" : ""} bg-chrome pt-[env(safe-area-inset-top)] text-white`}>
      <div className="flex min-h-12 items-center gap-1 px-2 py-1.5">
        {back ? (
          <BackButton href={back} />
        ) : (
          <span className="w-2" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-semibold leading-tight">{title}</h1>
          {sub && <div className="truncate text-[12.5px] text-white/70">{sub}</div>}
        </div>
        {action}
      </div>
      {/* "Synthetic data" or "Not for real patients", as in the full site's top bar. */}
      {dataNotice && <div className="bg-warn py-px text-center text-[10.5px] font-semibold uppercase tracking-wide text-white">{dataNotice.label}</div>}
    </header>
  );
}

// A titled group of rows, like a section of a phone settings screen.
export function PhoneSection({ title, action, children, className = "" }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`mt-4 ${className}`}>
      {(title || action) && (
        <div className="flex items-baseline justify-between px-4 pb-1.5">
          {title && <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">{title}</h2>}
          {action}
        </div>
      )}
      <div className="overflow-hidden border-y border-line bg-panel">{children}</div>
    </section>
  );
}

export function PhoneEmpty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-4 text-ink-3">{children}</p>;
}

// A tappable row with a chevron.
export function RowLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={`flex items-center gap-3 border-b border-line px-4 py-3 transition-colors last:border-b-0 active:bg-accent-soft/60 ${className}`}>
      <div className="min-w-0 flex-1">{children}</div>
      <Chevron />
    </Link>
  );
}

export function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-ink-3" aria-hidden>
      <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
