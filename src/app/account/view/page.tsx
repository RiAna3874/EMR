import { requireUser } from "@/lib/session";
import { getViewPrefs } from "@/lib/view-prefs-server";
import { VIEW_AREAS } from "@/lib/view-prefs";
import { ViewOptions } from "./view-options";

export const metadata = { title: "View options" };

// Everything a person can show or hide, in one place. The View buttons on each screen change the same settings.
export default async function ViewOptionsPage() {
  await requireUser();
  const prefs = await getViewPrefs();
  return (
    <div className="h-full overflow-y-auto bg-bg">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-[16px] font-semibold">View options</h1>
        <p className="mb-5 text-[12.5px] text-ink-2">
          Choose what you see. These are saved to your account, so they follow you to any computer. Nobody else&apos;s screen changes. The View button on each screen changes the same settings.
        </p>
        <ViewOptions areas={VIEW_AREAS} prefs={prefs} />
      </div>
    </div>
  );
}
