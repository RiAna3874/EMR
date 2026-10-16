import type { Metadata, Viewport } from "next";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/roles";
import { chatUnread } from "@/lib/chat/server";
import { brand } from "@/lib/brand";
import { TabBar } from "@/components/phone/tab-bar";
import { TrackPhoneHistory } from "@/components/phone/back-button";

// The phone view, like Epic Haiku: the clinic day, patient lists, a read-mostly chart,
// photos into Media or Import, and secure chat. The same data and permissions as the
// full site; the desktop screens are untouched. Installable from the browser's menu.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: brand.shortName, template: `%s · ${brand.shortName}` },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: brand.shortName, statusBarStyle: "black-translucent" },
  icons: { apple: "/app-icon/180" },
};

export const viewport: Viewport = {
  themeColor: "#12303f",
  viewportFit: "cover",
};

export default async function PhoneLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const chat = can(user.role, "useChat") ? await chatUnread(user.id) : null;
  return (
    <>
      {/* After sign-in the root layout can arrive already rendered with the full site's top bar (a server
          action's redirect skips the middleware); hide it, and let the page scroll as a phone page. */}
      <style>{"[data-desktop-chrome]{display:none!important}body{height:auto!important;display:block!important}"}</style>
      <div className="phone min-h-dvh bg-bg pb-[calc(3.5rem+env(safe-area-inset-bottom))] text-[15px]">
        <TrackPhoneHistory />
        {children}
        <TabBar showChat={!!chat} chatUnread={chat?.total ?? 0} chatUrgent={chat?.urgent ?? 0} />
      </div>
    </>
  );
}
