// Bangla numerals and dates for what the patient takes home. The chart itself stays in English.

const DIGITS = "০১২৩৪৫৬৭৮৯";
export const bnDigits = (s: string | number) => String(s).replace(/[0-9]/g, (d) => DIGITS[Number(d)]);

const MONTHS = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
const WEEKDAYS = ["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"];

// "২৮ অক্টোবর ২০২৬"; with the weekday, "বুধবার, ২৮ অক্টোবর ২০২৬".
export function bnDate(d: Date, { weekday = false } = {}) {
  const date = `${bnDigits(d.getDate())} ${MONTHS[d.getMonth()]} ${bnDigits(d.getFullYear())}`;
  return weekday ? `${WEEKDAYS[d.getDay()]}, ${date}` : date;
}
