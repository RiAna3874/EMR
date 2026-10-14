// Advice the provider adds to the visit prescription with one click, in English and Bangla.
// The printed copy uses the language picked when printing; anything typed is printed as typed.

export type AdvicePhrase = { id: string; group: string; en: string; bn: string };

export const ADVICE: AdvicePhrase[] = [
  { id: "water", group: "General", en: "Drink plenty of water.", bn: "প্রচুর পানি পান করবেন।" },
  { id: "rest", group: "General", en: "Take rest.", bn: "বিশ্রাম নিবেন।" },
  { id: "complete-course", group: "General", en: "Complete the full course of antibiotics.", bn: "এন্টিবায়োটিকের পুরো কোর্স শেষ করবেন।" },
  { id: "no-self-med", group: "General", en: "Do not take any medicine without a doctor's advice.", bn: "ডাক্তারের পরামর্শ ছাড়া কোনো ওষুধ খাবেন না।" },
  { id: "bring-rx", group: "General", en: "Bring this prescription and your reports at the next visit.", bn: "পরবর্তী সাক্ষাতে এই প্রেসক্রিপশন ও রিপোর্ট সাথে আনবেন।" },
  { id: "salt", group: "Diet", en: "Eat less salt. Avoid extra salt at the table.", bn: "লবণ কম খাবেন। পাতে আলাদা লবণ খাবেন না।" },
  { id: "oily", group: "Diet", en: "Avoid oily and fried food.", bn: "তৈলাক্ত ও ভাজা খাবার পরিহার করবেন।" },
  { id: "sugar", group: "Diet", en: "Avoid sugar, sweets and soft drinks.", bn: "চিনি, মিষ্টি ও কোমল পানীয় পরিহার করবেন।" },
  { id: "rice", group: "Diet", en: "Eat less rice; more vegetables.", bn: "ভাত কম খাবেন, শাকসবজি বেশি খাবেন।" },
  { id: "small-meals", group: "Diet", en: "Eat small meals at regular times.", bn: "অল্প অল্প করে নিয়মিত সময়ে খাবেন।" },
  { id: "walk", group: "Lifestyle", en: "Walk briskly for 30 minutes every day.", bn: "প্রতিদিন ৩০ মিনিট দ্রুত হাঁটবেন।" },
  { id: "weight", group: "Lifestyle", en: "Reduce your weight.", bn: "ওজন কমাবেন।" },
  { id: "smoking", group: "Lifestyle", en: "Stop smoking.", bn: "ধূমপান বন্ধ করবেন।" },
  { id: "tobacco", group: "Lifestyle", en: "Stop jorda, gul, betel leaf and other tobacco.", bn: "জর্দা, গুল, পান ও অন্যান্য তামাক বন্ধ করবেন।" },
  { id: "sleep", group: "Lifestyle", en: "Sleep 7 to 8 hours at night.", bn: "রাতে ৭-৮ ঘণ্টা ঘুমাবেন।" },
  { id: "bp-check", group: "Monitoring", en: "Check your blood pressure regularly and keep a record.", bn: "নিয়মিত রক্তচাপ মেপে লিখে রাখবেন।" },
  { id: "sugar-check", group: "Monitoring", en: "Check your blood sugar regularly and keep a record.", bn: "নিয়মিত রক্তের সুগার মেপে লিখে রাখবেন।" },
  { id: "hypo", group: "Monitoring", en: "If you feel shaky, sweaty or dizzy, eat sugar or sweets at once.", bn: "হাত কাঁপা, ঘাম বা মাথা ঘোরা হলে সাথে সাথে চিনি বা মিষ্টি খাবেন।" },
  { id: "foot", group: "Monitoring", en: "Check your feet every day for wounds.", bn: "প্রতিদিন পায়ে কোনো ক্ষত আছে কিনা দেখবেন।" },
  { id: "warning", group: "Come back sooner", en: "Come back at once if the fever, pain or breathing gets worse.", bn: "জ্বর, ব্যথা বা শ্বাসকষ্ট বাড়লে সাথে সাথে আসবেন।" },
  { id: "chest-pain", group: "Come back sooner", en: "Go to hospital at once for chest pain, fainting or weakness of one side.", bn: "বুকে ব্যথা, অজ্ঞান হওয়া বা শরীরের এক পাশ দুর্বল হলে সাথে সাথে হাসপাতালে যাবেন।" },
  { id: "dehydration", group: "Come back sooner", en: "Take oral saline after each loose stool. Come back if you cannot drink or pass little urine.", bn: "প্রতিবার পাতলা পায়খানার পর খাবার স্যালাইন খাবেন। পান করতে না পারলে বা প্রস্রাব কমে গেলে আসবেন।" },
];

const byText = new Map(ADVICE.flatMap((a) => [[a.en, a] as const, [a.bn, a] as const]));

// Advice lines in the printed language: a library phrase is swapped for its other
// language; typed lines print as typed.
export function adviceLines(advice: string | null | undefined, lang: "en" | "bn") {
  return (advice ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => byText.get(l)?.[lang] ?? l);
}
