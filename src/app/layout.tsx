import type { Metadata } from "next";
import { TopBar } from "@/components/top-bar";
import { inboxCounts } from "@/lib/inbox";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/roles";
import { chatBadge } from "@/lib/chat/server";
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
  // Browser extensions (e.g. QuillBot) add attributes to <html> before React loads.
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex h-screen flex-col antialiased print:block print:h-auto">
        {user && (
          <TopBar
            user={user}
            inboxCount={can(user.role, "useInbox") ? (await inboxCounts(user)).total : null}
            chat={can(user.role, "useChat") ? await chatBadge(user.id) : { total: 0, urgent: 0, latestUrgent: null }}
          />
        )}
        <div className="min-h-0 flex-1 print:min-h-0">{children}</div>
      </body>
    </html>
  );
}

