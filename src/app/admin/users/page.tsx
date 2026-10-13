import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { StaffAccounts } from "./staff-accounts";

export const metadata = { title: "Staff accounts · Meridian EMR" };
export const dynamic = "force-dynamic";

// Administrators add staff, issue temporary passwords, change roles and deactivate accounts.
// Accounts are never deleted: notes, orders and results keep pointing at who did them.
export default async function StaffAccountsPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  const me = await requireAdmin();
  const accounts = await db.practitioner.findMany({
    where: { username: { not: null } },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, credentials: true, role: true, username: true, isAdmin: true, active: true, mustChangePassword: true },
  });
  return (
    <div className="h-full overflow-y-auto bg-bg">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <h1 className="text-[16px] font-semibold">Staff accounts</h1>
        <p className="mb-4 text-[12.5px] text-ink-2">
          Add each person with their own account. They get a temporary password and choose their own at first sign-in. Deactivate accounts when people leave; their
          history stays on the chart.
        </p>
        {welcome && (
          <p className="mb-4 rounded-md border border-accent/30 bg-accent-soft px-3 py-2 text-accent">
            You&apos;re the first administrator. Add the rest of your staff below.
          </p>
        )}
        <StaffAccounts accounts={accounts.map((a) => ({ ...a, username: a.username! }))} meId={me.id} />
      </div>
    </div>
  );
}
