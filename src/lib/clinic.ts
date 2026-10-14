// The clinic printed on letterheads, requisitions and prescriptions. Set the
// MERIDIAN_CLINIC_* variables for a real clinic; the defaults are fictional.
export const clinic = {
  name: process.env.MERIDIAN_CLINIC_NAME || "Lakeview Family Medicine",
  address: process.env.MERIDIAN_CLINIC_ADDRESS || "400 Lakeshore Drive, Suite 200, Lakeview, OR 97630",
  phone: process.env.MERIDIAN_CLINIC_PHONE || "(555) 200-1000",
  fax: process.env.MERIDIAN_CLINIC_FAX || "(555) 200-1001",
};

// Standard clinic hours, used for any physician or resident who has no weekly
// sessions of their own (set at Schedule > Provider templates). The default is a
// Bangladesh workweek, Sunday to Thursday, 9:00 to 17:00, in 20-minute slots.
// Override with MERIDIAN_CLINIC_DAYS ("Sun,Mon,Tue,Wed,Thu") and
// MERIDIAN_CLINIC_HOURS ("09:00-17:00"). Times are in the server's TZ.
const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function parseClinicHours(days?: string, hours?: string) {
  const weekdays = (days || "Sun,Mon,Tue,Wed,Thu")
    .split(/[\s,]+/)
    .map((d) => DAY_NAMES.indexOf(d.slice(0, 3).toLowerCase()))
    .filter((d) => d >= 0);
  const m = (hours || "09:00-17:00").match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  const startMin = m ? +m[1] * 60 + +m[2] : 9 * 60;
  const endMin = m ? +m[3] * 60 + +m[4] : 17 * 60;
  const ok = weekdays.length > 0 && endMin > startMin;
  return {
    weekdays: ok ? [...new Set(weekdays)] : [0, 1, 2, 3, 4],
    startMin: ok ? startMin : 9 * 60,
    endMin: ok ? endMin : 17 * 60,
    slotMinutes: 20,
  };
}

export const clinicHours = parseClinicHours(process.env.MERIDIAN_CLINIC_DAYS, process.env.MERIDIAN_CLINIC_HOURS);

// The clinic hours as weekly sessions, in the shape ScheduleSession rows have.
export const standardSessions = (practitionerId: string) =>
  clinicHours.weekdays.map((weekday) => ({
    id: `standard-${practitionerId}-${weekday}`,
    practitionerId,
    weekday,
    startMin: clinicHours.startMin,
    endMin: clinicHours.endMin,
    slotMinutes: clinicHours.slotMinutes,
  }));
