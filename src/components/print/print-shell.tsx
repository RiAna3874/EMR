import Link from "next/link";
import { clinic } from "@/lib/clinic";
import { brand } from "@/lib/brand";
import { dataNotice } from "@/lib/deployment";
import { PrintButton } from "./print-button";

// Screen: a paper preview with a toolbar. Print: just the page.
export function PrintShell({ children, back, tabs }: { children: React.ReactNode; back: string; tabs?: { label: string; href: string; active: boolean }[] }) {
  return (
    <div className="h-full overflow-y-auto bg-[#e6eaee] print:h-auto print:overflow-visible print:bg-white">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-panel px-4 py-2 print:hidden">
        <Link href={back} className="text-[12.5px] font-medium text-accent hover:underline">
          ← Back
        </Link>
        {tabs && (
          <div className="flex overflow-hidden rounded border border-line text-[12.5px]">
            {tabs.map((t) => (
              <Link key={t.href} href={t.href} className={`border-l border-line px-3 py-1 first:border-l-0 ${t.active ? "bg-chrome text-white" : "text-ink-2 hover:bg-panel-muted"}`}>
                {t.label}
              </Link>
            ))}
          </div>
        )}
        <PrintButton />
      </div>
      <div className="mx-auto my-6 w-[8.5in] max-w-full bg-white px-[0.6in] py-[0.55in] text-[12px] leading-snug text-black shadow-md print:m-0 print:w-auto print:p-0 print:shadow-none">
        {children}
      </div>
    </div>
  );
}

export function Letterhead({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <header className="flex items-start justify-between border-b-2 border-black pb-2">
      <div>
        <div className="text-[16px] font-bold tracking-wide">{clinic.name}</div>
        <div className="text-[11px]">{clinic.address}</div>
        <div className="text-[11px]">
          Phone {clinic.phone} · Fax {clinic.fax}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[15px] font-bold uppercase tracking-wider">{title}</div>
        <div className="text-[11px]">{right}</div>
      </div>
    </header>
  );
}

export function PrintFooter({ children }: { children?: React.ReactNode }) {
  return (
    <footer className="mt-6 border-t border-black/40 pt-1.5 text-[10px] text-black/70">
      {children}
      <div>
        {brand.fullName}
        {dataNotice && ` · ${dataNotice.text}`}
      </div>
    </footer>
  );
}
