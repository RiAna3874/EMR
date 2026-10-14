// Runs once when the server starts. A live site refuses to start without the clinic's time
// zone: "today", the schedule and every visit time are read from the server clock, which is
// UTC on most hosts, so a missing TZ would put every time 6 hours off without anyone noticing.
// (A failed start leaves the previous deploy running on Render.) See docs/DEPLOY.md.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const tz = process.env.TZ;
  let problem = tz ? null : "TZ is not set.";
  if (tz) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
    } catch {
      problem = `TZ="${tz}" is not a time zone.`;
    }
  }
  if (problem) {
    console.error(`${problem} Set TZ to the clinic's time zone, e.g. TZ=Asia/Dhaka, and restart.`);
    process.exit(1);
  }
}
