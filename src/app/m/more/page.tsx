import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can, displayName, roleLabel } from "@/lib/roles";
import { signOut } from "@/app/login/actions";
import { lockScreen } from "@/app/lock/actions";
import { StatusPicker } from "@/components/chat/status-picker";
import { Chevron, PhoneHeader, PhoneSection } from "@/components/phone/header";
import { InstallHint } from "@/components/phone/install-hint";

export const metadata = { title: "More" };

export default async function PhoneMore() {
  const user = await requireUser();
  const me = can(user.role, "useChat")
    ? await db.practitioner.findUniqueOrThrow({ where: { id: user.id }, select: { chatStatus: true, chatStatusNote: true } })
    : null;
  return (
    <>
      <PhoneHeader title="More" />
      <PhoneSection title="Signed in">
        <div className="px-4 py-3">
          <div className="font-semibold">{displayName(user)}</div>
          <div className="text-[13px] text-ink-3">
            {roleLabel[user.role]} · {user.username}
          </div>
          {me && (
            <div className="mt-2">
              <StatusPicker key={`${me.chatStatus}:${me.chatStatusNote ?? ""}`} status={me.chatStatus} note={me.chatStatusNote} />
            </div>
          )}
        </div>
      </PhoneSection>

      <PhoneSection title="This phone">
        <InstallHint />
        {/* A plain link: prefetching it would set the choice just by opening this screen. */}
        <a href="/view/full-site" className="flex items-center gap-3 px-4 py-3 active:bg-accent-soft/60">
          <div className="min-w-0 flex-1">
            <div className="font-medium">Open the full site</div>
            <div className="text-[13px] text-ink-3">Visit screen, prescribing, orders, writing notes and verifying imports. Come back with Phone view at the top.</div>
          </div>
          <Chevron />
        </a>
      </PhoneSection>

      <div className="mt-6 flex flex-col gap-2 px-4">
        <form action={lockScreen.bind(null, "/m")}>
          <button type="submit" className="w-full rounded-lg border border-line bg-panel py-3 font-semibold text-ink active:bg-panel-muted">
            Lock screen
          </button>
        </form>
        <form action={signOut}>
          <button type="submit" className="w-full rounded-lg border border-crit/30 bg-panel py-3 font-semibold text-crit active:bg-crit-soft">
            Sign out
          </button>
        </form>
      </div>
      <p className="px-4 pt-4 text-center text-[12px] text-ink-3">
        <Link href="/account/password" className="underline">
          Change password
        </Link>
      </p>
    </>
  );
}
