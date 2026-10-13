import type { Metadata } from "next";
import { TopBar } from "@/components/top-bar";
import { inboxCounts } from "@/lib/inbox";
import { getCurrentUser, signInComplete } from "@/lib/session";
import { signOut } from "@/app/login/actions";
import { can } from "@/lib/roles";
import { chatBadge } from "@/lib/chat/server";
import { dataNotice } from "@/lib/deployment";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meridian EMR",
  description: "Outpatient electronic medical record",
};

// Every screen reads live chart data, and the Inbox count sits in the top bar.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Signed out, only the sign-in page renders (the middleware sends everything else there).
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body className="flex h-screen flex-col antialiased print:block print:h-auto">
        {/* Part-way through sign-in (temporary password, two-step not set up): no chart data, just a way out. */}
        {user && !signInComplete(user) && (
          <header className="flex h-11 shrink-0 items-center justify-between bg-chrome px-4 text-[12.5px] text-white/80 print:hidden">
            <span className="font-semibold tracking-wide text-white">Meridian</span>
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

