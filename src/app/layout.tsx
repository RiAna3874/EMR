import type { Metadata } from "next";
import { TopBar } from "@/components/top-bar";
import { inboxCounts } from "@/lib/inbox";
import { currentUser } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meridian EMR",
  description: "Outpatient electronic medical record (synthetic data only)",
};

// Every screen reads live chart data, and the Inbox count sits in the top bar.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="flex h-screen flex-col antialiased print:block print:h-auto">
        <TopBar inboxCount={(await inboxCounts(currentUser.id)).total} />
        <div className="min-h-0 flex-1 print:min-h-0">{children}</div>
      </body>
    </html>
  );
}
