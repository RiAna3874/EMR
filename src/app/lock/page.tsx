import { redirect } from "next/navigation";
import { getCurrentUser, safeNext } from "@/lib/session";
import { displayName } from "@/lib/roles";
import { signOut } from "@/app/login/actions";
import { UnlockForm } from "./unlock-form";

export const metadata = { title: "Locked" };

// Shown after the screen was left idle. Nothing from the chart is on this page.
export default async function Lock({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.locked) redirect(safeNext(next));
  return (
    <main className="flex h-full items-center justify-center overflow-y-auto bg-chrome p-4">
      <div className="w-full max-w-sm rounded-md border border-line bg-panel p-5 shadow-lg">
        <h1 className="text-[15px] font-semibold">Screen locked</h1>
        <p className="mt-1 text-ink-2">
          {displayName(user)} is signed in. Type your password to carry on where you left off.
        </p>
        <UnlockForm next={safeNext(next)} username={user.username} />
        <form action={signOut} className="mt-3 border-t border-line pt-3">
          <button type="submit" className="text-[12.5px] text-accent hover:underline">
            Not {user.name}? Sign out and sign in as yourself
          </button>
        </form>
      </div>
    </main>
  );
}
