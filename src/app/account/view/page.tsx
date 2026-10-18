import { requireUser } from "@/lib/session";
import { can } from "@/lib/roles";
import { chartTabs } from "@/lib/chart-tabs";
import { getViewPrefs } from "@/lib/view-prefs-server";
import { VIEW_AREAS } from "@/lib/view-prefs";
import { ViewOptions } from "./view-options";

export const metadata = { title: "View options" };

// Everything a person can show, hide or move, in one place. The View buttons on each screen change the same settings.
export default async function ViewOptionsPage() {
  const user = await requireUser();
  const prefs = await getViewPrefs();
  const startTabs = chartTabs.filter((t) => !t.needs || can(user.role, t.needs)).map((t) => ({ slug: t.slug, label: t.label }));
  return (
    <div className="h-full overflow-y-auto bg-bg">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-[16px] font-semibold">View options</h1>
        <p className="mb-5 text-[12.5px] text-ink-2">
          Choose what you see and where it sits. These are saved to your account, so they follow you to any computer. Nobody else&apos;s screen changes. The View button on each screen changes the same settings.
        </p>
        <ViewOptions areas={VIEW_AREAS} prefs={prefs} startTabs={startTabs} />
      </div>
    </div>
  );
}
