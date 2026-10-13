import type { Metadata } from "next";
import { TopBar } from "@/components/top-bar";
import { inboxCounts } from "@/lib/inbox";
import { getCurrentUser, signInComplete } from "@/lib/session";
import { signOut } from "@/app/login/actions";
import { can } from "@/lib/roles";
import { chatBadge } from "@/lib/chat/server";
import { dataNotice } from "@/lib/deployment";
import { brand, brandStyle } from "@/lib/brand";
import { BrandMark } from "@/components/brand-mark";
import "./globals.css";

export const metadata: Metadata = {
  // Pages set just their own part ("Sign in"); the product name is added here.
  title: { default: brand.fullName, template: `%s · ${brand.fullName}` },
  description: "Outpatient electronic medical record",
  ...(brand.logoUrl && { icons: { icon: brand.logoUrl } }),
};

// Every screen reads live chart data, and the Inbox count sits in the top bar.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Signed out, only the sign-in page renders (the middleware sends everything else there).
  const user = await getCurrentUser();
  return (
    <html lang="en" style={brandStyle()}>
      <body className="flex h-screen flex-col antialiased print:block print:h-auto">
        {/* Part-way through sign-in (temporary password, two-step not set up): no chart data, just a way out. */}
        {user && !signInComplete(user) && (
          <header className="flex h-11 shrink-0 items-center justify-between bg-chrome px-4 text-[12.5px] text-white/80 print:hidden">
            <span className="flex items-center gap-2 font-semibold tracking-wide text-white">
              <BrandMark name={brand.shortName} logoUrl={brand.logoUrl} />
            </span>
            <form action={signOut}>
              <button type="submit" className="rounded border border-white/15 px-2 py-0.5 text-[12px] hover:bg-white/10 hover:text-white">
                Sign out
              </button>
            </form>
          </header>
        )}
        {user && signInComplete(user) && (
          <TopBar
            user={user}
            brand={{ name: brand.shortName, logoUrl: brand.logoUrl }}
            dataLabel={dataNotice?.label ?? null}
            inboxCount={can(user.role, "useInbox") ? (await inboxCounts(user)).total : null}
            chat={can(user.role, "useChat") ? await chatBadge(user.id) : { total: 0, urgent: 0, latestUrgent: null }}
          />
        )}
        <div className="min-h-0 flex-1 print:min-h-0">{children}</div>
      </body>
    </html>
  );
}

