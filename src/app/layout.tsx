import type { Metadata } from "next";
import { TopBar } from "@/components/top-bar";
import { inboxCounts } from "@/lib/inbox";
import { getCurrentUser, LOCK_AFTER_MS, signInComplete } from "@/lib/session";
import { IdleLock } from "@/components/idle-lock";
import { signOut } from "@/app/login/actions";
import { can } from "@/lib/roles";
import { chatBadge } from "@/lib/chat/server";
import { dataNotice } from "@/lib/deployment";
import { brand, brandStyle } from "@/lib/brand";
import { BrandMark } from "@/components/brand-mark";
import { headers } from "next/headers";
import { PHONE_VIEW_HEADER } from "@/lib/phone-view";
import { Dictation } from "@/components/dictation";
import { dictationMode } from "@/lib/dictation/engine";
import { HoverProvider } from "@/components/hover/hover-card";
import { Tips } from "@/components/hover/tips";
import { getViewPrefs } from "@/lib/view-prefs-server";
import { movableOrder } from "@/lib/view-prefs";
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
  // The phone view (/m) has its own header and tab bar (src/app/m/layout.tsx); it keeps the idle lock.
  if ((await headers()).get(PHONE_VIEW_HEADER)) {
    return (
      <html lang="en" style={brandStyle()}>
        <body className="antialiased">
          {user && signInComplete(user) && <IdleLock afterMs={LOCK_AFTER_MS} />}
          {children}
          {user && signInComplete(user) && dictationMode() && <Dictation engine={dictationMode()!} />}
        </body>
      </html>
    );
  }
  const signedIn = !!user && signInComplete(user);
  // Hover cards and quick tips are on unless this person turned them off (src/lib/view-prefs.ts).
  const prefs = await getViewPrefs();
  const hover = signedIn && prefs.hover;
  return (
    <html lang="en" style={brandStyle()}>
      <body className="flex h-screen flex-col antialiased print:block print:h-auto">
        <HoverProvider on={hover}>
          {/* Part-way through sign-in (temporary password, two-step not set up): no chart data, just a way out. */}
          {/* data-desktop-chrome: hidden by the phone view if this layout was rendered for another page (src/app/m/layout.tsx). */}
          {user && !signInComplete(user) && (
            <header data-desktop-chrome className="flex h-11 shrink-0 items-center justify-between bg-chrome px-4 text-[12.5px] text-white/80 print:hidden">
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
          {user && signInComplete(user) && <IdleLock afterMs={LOCK_AFTER_MS} />}
          {user && signInComplete(user) && (
            <div data-desktop-chrome className="contents">
              <TopBar
                user={user}
                brand={{ name: brand.shortName, logoUrl: brand.logoUrl }}
                dataLabel={dataNotice?.label ?? null}
                inboxCount={can(user.role, "useInbox") ? (await inboxCounts(user)).total : null}
                chat={can(user.role, "useChat") ? await chatBadge(user.id) : { total: 0, urgent: 0, latestUrgent: null }}
                navOrder={movableOrder(prefs, "nav")}
                drag={prefs.drag}
              />
            </div>
          )}
          {/* Text size (View options) scales the screen below the top bar; hover cards and tips sit outside it. */}
          <div className="min-h-0 flex-1 print:min-h-0" style={signedIn && prefs.textSize !== 100 ? { zoom: prefs.textSize / 100 } : undefined}>
            {children}
          </div>
          {/* A microphone on whichever text box has the cursor (docs/DICTATION.md). */}
          {user && signInComplete(user) && dictationMode() && <Dictation engine={dictationMode()!} />}
          <Tips />
        </HoverProvider>
      </body>
    </html>
  );
}

