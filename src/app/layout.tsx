import type { Metadata } from "next";
import { TopBar } from "@/components/top-bar";
import { inboxCounts } from "@/lib/inbox";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/roles";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meridian EMR",
  description: "Outpatient electronic medical record (synthetic data only)",
};

// Every screen reads live chart data, and the Inbox count sits in the top bar.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Signed out, only the sign-in page renders (the middleware sends everything else there).
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body className="flex h-screen flex-col antialiased print:block print:h-auto">
        {user && <TopBar user={user} inboxCount={can(user.role, "useInbox") ? (await inboxCounts(user)).total : null} />}
        <div className="min-h-0 flex-1 print:min-h-0">{children}</div>
      </body>
    </html>
  );
}
