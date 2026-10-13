import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { displayName } from "@/lib/roles";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Change password · Meridian EMR" };

export default async function ChangePassword() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <div className="h-full overflow-y-auto bg-bg">
      <div className="mx-auto max-w-md px-6 py-8">
        <h1 className="text-[16px] font-semibold">Change password</h1>
        <p className="mb-4 text-[12.5px] text-ink-2">{displayName(user)} · {user.username}</p>
        {user.mustChangePassword && (
          <p role="alert" className="mb-4 rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-warn">
            You signed in with a temporary password. Choose your own to continue.
          </p>
        )}
        <PasswordForm />
      </div>
    </div>
  );
}
