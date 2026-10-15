// Drug knowledge for prescribing checks: ingredients and their classes, dose
// limits, kidney and older-adult cautions, interactions, and what a refill
// protocol wants to see. A small hand-written table for a synthetic clinic, not a
// licensed drug database (worldwide names are in generics.ts; this is what the checks
// know); ingredients are found by name, so the checks work for
// any medication on the list, including ones documented as free text. Common
// Bangladeshi brand names (Napa, Seclo, ...) match their generic.

export type Monitor = { label: string; codes: string[]; months: number };

export type Ingredient = {
  id: string;
  name: string;
  match: RegExp;
  classes: string[];
  controlled?: boolean; // a narcotic or psychotropic: no refills, smallest amount needed
  maxDailyMg?: number;
  maxDailyMgOlder?: number; // 65 and over
  renal?: { stopBelow?: number; cautionBelow?: number; stop?: string; caution?: string };
  olderAdult?: string; // a Beers-style caution at 65 and over
  monitor?: Monitor[];
};

const BMP: Monitor = { label: "Potassium and creatinine", codes: ["51990-0", "24323-8", "2823-3", "2160-0"], months: 12 };
const LIPIDS: Monitor = { label: "Lipid panel", codes: ["57698-3", "13457-7"], months: 12 };

export const INGREDIENTS: Ingredient[] = [
  { id: "amoxicillin", name: "amoxicillin", match: /amoxicillin|moxacil|fimoxyl/i, classes: ["penicillin", "beta-lactam"] },
  { id: "cephalexin", name: "cephalexin", match: /cephalexin/i, classes: ["cephalosporin", "beta-lactam"] },
  { id: "azithromycin", name: "azithromycin", match: /azithromycin|zimax|azithrocin/i, classes: ["macrolide", "qt-prolonging"] },
  { id: "clarithromycin", name: "clarithromycin", match: /clarithromycin/i, classes: ["macrolide", "qt-prolonging", "cyp3a4-inhibitor"], maxDailyMg: 1000 },
  {
    id: "nitrofurantoin", name: "nitrofurantoin", match: /nitrofurantoin/i, classes: [],
    renal: { cautionBelow: 30, caution: "nitrofurantoin is less effective and more toxic." },
  },
  { id: "sulfamethoxazole", name: "sulfamethoxazole-trimethoprim", match: /sulfamethoxazole|bactrim|co-?trimoxazole/i, classes: ["sulfonamide", "potassium-raising"] },
  { id: "prednisone", name: "prednisone", match: /prednisone/i, classes: ["corticosteroid"] },
  {
    id: "metformin", name: "metformin", match: /metformin/i, classes: ["glucose-lowering"], maxDailyMg: 2550,
    renal: { stopBelow: 30, cautionBelow: 45, stop: "Metformin is contraindicated", caution: "don't start metformin below 45." },
    monitor: [
      { label: "Hemoglobin A1c", codes: ["4548-4"], months: 6 },
      { label: "Kidney function (eGFR)", codes: ["33914-3", "2160-0"], months: 12 },
    ],
  },
  { id: "glipizide", name: "glipizide", match: /glipizide/i, classes: ["sulfonylurea", "glucose-lowering"], maxDailyMg: 40, olderAdult: "sulfonylureas cause prolonged hypoglycemia." },
  { id: "insulin", name: "insulin", match: /insulin/i, classes: ["insulin", "glucose-lowering"], monitor: [{ label: "Hemoglobin A1c", codes: ["4548-4"], months: 6 }] },
  { id: "semaglutide", name: "semaglutide", match: /semaglutide/i, classes: ["glp1", "glucose-lowering"] },
  { id: "lisinopril", name: "lisinopril", match: /lisinopril/i, classes: ["ace-inhibitor", "potassium-raising"], maxDailyMg: 80, monitor: [BMP] },
  { id: "losartan", name: "losartan", match: /losartan|osartil|angilock/i, classes: ["arb", "potassium-raising"], maxDailyMg: 100, monitor: [BMP] },
  { id: "amlodipine", name: "amlodipine", match: /amlodipine|camlodin|amdocal/i, classes: ["calcium-channel-blocker"], maxDailyMg: 10 },
  { id: "metoprolol", name: "metoprolol", match: /metoprolol/i, classes: ["beta-blocker"], maxDailyMg: 400 },
  { id: "furosemide", name: "furosemide", match: /furosemide/i, classes: ["loop-diuretic"], monitor: [{ ...BMP, months: 6 }] },
  { id: "atorvastatin", name: "atorvastatin", match: /atorvastatin/i, classes: ["statin"], maxDailyMg: 80, monitor: [LIPIDS] },
  { id: "rosuvastatin", name: "rosuvastatin", match: /rosuvastatin/i, classes: ["statin"], maxDailyMg: 40, monitor: [LIPIDS] },
  { id: "apixaban", name: "apixaban", match: /apixaban/i, classes: ["anticoagulant"], maxDailyMg: 20, monitor: [{ label: "CBC and creatinine", codes: ["58410-2", "718-7"], months: 12 }, BMP] },
  { id: "warfarin", name: "warfarin", match: /warfarin/i, classes: ["anticoagulant"], monitor: [{ label: "INR", codes: ["5902-2"], months: 1 }] },
  { id: "aspirin", name: "aspirin", match: /aspirin|ecosprin/i, classes: ["antiplatelet", "salicylate"] },
  { id: "clopidogrel", name: "clopidogrel", match: /clopidogrel/i, classes: ["antiplatelet"] },
  {
    id: "ibuprofen", name: "ibuprofen", match: /ibuprofen/i, classes: ["nsaid"], maxDailyMg: 3200,
    renal: { cautionBelow: 45, caution: "NSAIDs can worsen kidney function." },
    olderAdult: "avoid regular NSAID use; GI bleeding and kidney injury are more likely.",
  },
  {
    id: "naproxen", name: "naproxen", match: /naproxen/i, classes: ["nsaid"], maxDailyMg: 1500,
    renal: { cautionBelow: 45, caution: "NSAIDs can worsen kidney function." },
    olderAdult: "avoid regular NSAID use; GI bleeding and kidney injury are more likely.",
  },
  { id: "acetaminophen", name: "acetaminophen", match: /acetaminophen|paracetamol|\bnapa\b|\bace\b/i, classes: ["analgesic"], maxDailyMg: 4000, maxDailyMgOlder: 3000 },
  { id: "codeine", name: "codeine", match: /codeine/i, classes: ["opioid", "codeine", "cns-depressant"], controlled: true, olderAdult: "opioids raise fall and confusion risk." },
  { id: "oxycodone", name: "oxycodone", match: /oxycodone/i, classes: ["opioid", "cns-depressant"], controlled: true, olderAdult: "opioids raise fall and confusion risk." },
  {
    id: "tramadol", name: "tramadol", match: /tramadol/i, classes: ["opioid", "serotonergic", "cns-depressant"], controlled: true, maxDailyMg: 400,
    renal: { cautionBelow: 30, caution: "give tramadol no more than every 12 hours (max 200 mg a day)." },
  },
  {
    id: "cyclobenzaprine", name: "cyclobenzaprine", match: /cyclobenzaprine/i, classes: ["muscle-relaxant", "cns-depressant", "serotonergic"], maxDailyMg: 30,
    olderAdult: "muscle relaxants are anticholinergic and sedating; poorly tolerated.",
  },
  { id: "ondansetron", name: "ondansetron", match: /ondansetron/i, classes: ["antiemetic", "qt-prolonging", "serotonergic"], maxDailyMg: 24 },
  { id: "sertraline", name: "sertraline", match: /sertraline/i, classes: ["ssri", "serotonergic"], maxDailyMg: 200 },
  { id: "sumatriptan", name: "sumatriptan", match: /sumatriptan/i, classes: ["triptan", "serotonergic"], maxDailyMg: 200 },
  { id: "levothyroxine", name: "levothyroxine", match: /levothyroxine|thyrox/i, classes: ["thyroid"], monitor: [{ label: "TSH", codes: ["3016-3"], months: 12 }] },
  { id: "iron", name: "iron", match: /ferrous|\biron\b/i, classes: ["iron"] },
  { id: "calcium", name: "calcium", match: /calcium carbonate|calcium citrate/i, classes: ["calcium"] },
  { id: "omeprazole", name: "omeprazole", match: /(?<!es)omeprazole|seclo|losectil/i, classes: ["ppi"] },
  { id: "albuterol", name: "albuterol", match: /albuterol|salbutamol|azmasol|ventolin/i, classes: ["saba"] },
  { id: "fluticasone", name: "fluticasone-salmeterol", match: /fluticasone/i, classes: ["inhaled-steroid", "laba"] },
  { id: "tiotropium", name: "tiotropium", match: /tiotropium/i, classes: ["lama"] },
  { id: "epinephrine", name: "epinephrine", match: /epinephrine/i, classes: [] },
  {
    id: "alendronate", name: "alendronate", match: /alendronate/i, classes: ["bisphosphonate"],
    renal: { stopBelow: 35, stop: "Alendronate is not recommended" },
  },
  { id: "donepezil", name: "donepezil", match: /donepezil/i, classes: ["cholinesterase-inhibitor"] },
  { id: "cholecalciferol", name: "vitamin D", match: /cholecalciferol|vitamin d/i, classes: [] },
  { id: "tamsulosin", name: "tamsulosin", match: /tamsulosin/i, classes: ["alpha-blocker"] },
  { id: "tretinoin", name: "tretinoin", match: /tretinoin/i, classes: ["retinoid"] },
  { id: "esomeprazole", name: "esomeprazole", match: /esomeprazole|maxpro|sergel|nexum/i, classes: ["ppi"] },
  { id: "pantoprazole", name: "pantoprazole", match: /pantoprazole|pantonix/i, classes: ["ppi"] },
  { id: "fexofenadine", name: "fexofenadine", match: /fexofenadine|\bfexo\b|telfast/i, classes: ["antihistamine"], maxDailyMg: 180 },
  { id: "cetirizine", name: "cetirizine", match: /(?<!levo)cetirizine|alatrol/i, classes: ["antihistamine"], maxDailyMg: 10 },
  { id: "montelukast", name: "montelukast", match: /montelukast|monas/i, classes: [], maxDailyMg: 10 },
  { id: "domperidone", name: "domperidone", match: /domperidone|omidon/i, classes: ["antiemetic", "qt-prolonging"], maxDailyMg: 30, olderAdult: "domperidone raises the risk of heart rhythm problems; use the lowest dose briefly." },
  { id: "metronidazole", name: "metronidazole", match: /metronidazole|flagyl|filmet|amodis/i, classes: ["nitroimidazole"], maxDailyMg: 4000 },
  { id: "ciprofloxacin", name: "ciprofloxacin", match: /ciprofloxacin|ciprocin/i, classes: ["fluoroquinolone", "qt-prolonging"], maxDailyMg: 1500 },
  { id: "cefixime", name: "cefixime", match: /cefixime|cef-3/i, classes: ["cephalosporin", "beta-lactam"], maxDailyMg: 400 },
  { id: "flucloxacillin", name: "flucloxacillin", match: /flucloxacillin/i, classes: ["penicillin", "beta-lactam"], maxDailyMg: 4000 },
  { id: "gliclazide", name: "gliclazide", match: /gliclazide/i, classes: ["sulfonylurea", "glucose-lowering"], maxDailyMg: 320, olderAdult: "sulfonylureas cause prolonged hypoglycemia." },
  { id: "bisoprolol", name: "bisoprolol", match: /bisoprolol|bisocor|concor/i, classes: ["beta-blocker"], maxDailyMg: 20 },
  { id: "albendazole", name: "albendazole", match: /albendazole/i, classes: [] },
  { id: "ors", name: "oral rehydration salts", match: /oral rehydration|\bors\b|orsaline/i, classes: [] },
  {
    id: "allopurinol", name: "allopurinol", match: /allopurinol/i, classes: ["xanthine-oxidase-inhibitor"], maxDailyMg: 800,
    renal: { cautionBelow: 30, caution: "start allopurinol low and titrate slowly." },
    monitor: [{ label: "Uric acid", codes: ["3084-1"], months: 12 }],
  },
  // Common in Bangladesh, added with the worldwide generic names list. Daily maximums are
  // set only where one adult limit holds across forms; anything weight-, level- or
  // indication-dependent is left to the prescriber.
  // Antibiotics
  { id: "ampicillin", name: "ampicillin", match: /ampicillin/i, classes: ["penicillin", "beta-lactam"] },
  { id: "cloxacillin", name: "cloxacillin", match: /(?<!flu)cloxacillin/i, classes: ["penicillin", "beta-lactam"] },
  { id: "penicillin-v", name: "phenoxymethylpenicillin", match: /phenoxymethylpenicillin|penicillin v\b/i, classes: ["penicillin", "beta-lactam"] },
  { id: "cefuroxime", name: "cefuroxime", match: /cefuroxime/i, classes: ["cephalosporin", "beta-lactam"] },
  { id: "ceftriaxone", name: "ceftriaxone", match: /ceftriaxone/i, classes: ["cephalosporin", "beta-lactam"] },
  { id: "cefradine", name: "cefradine", match: /cefradine|cephradine/i, classes: ["cephalosporin", "beta-lactam"] },
  { id: "cefpodoxime", name: "cefpodoxime", match: /cefpodoxime/i, classes: ["cephalosporin", "beta-lactam"], maxDailyMg: 800 },
  { id: "erythromycin", name: "erythromycin", match: /erythromycin/i, classes: ["macrolide", "qt-prolonging", "cyp3a4-inhibitor"], maxDailyMg: 4000 },
  { id: "doxycycline", name: "doxycycline", match: /doxycycline/i, classes: ["tetracycline"] },
  {
    id: "levofloxacin", name: "levofloxacin", match: /levofloxacin/i, classes: ["fluoroquinolone", "qt-prolonging"], maxDailyMg: 1000,
    renal: { cautionBelow: 50, caution: "reduce the levofloxacin dose." },
  },
  {
    id: "ofloxacin", name: "ofloxacin", match: /(?<![a-z])ofloxacin/i, classes: ["fluoroquinolone", "qt-prolonging"], maxDailyMg: 800,
    renal: { cautionBelow: 50, caution: "reduce the ofloxacin dose." },
  },
  { id: "moxifloxacin", name: "moxifloxacin", match: /moxifloxacin/i, classes: ["fluoroquinolone", "qt-prolonging"], maxDailyMg: 400 },
  { id: "clindamycin", name: "clindamycin", match: /clindamycin/i, classes: ["lincosamide"] },
  { id: "linezolid", name: "linezolid", match: /linezolid/i, classes: ["oxazolidinone", "serotonergic"], maxDailyMg: 1200, monitor: [{ label: "CBC", codes: ["58410-2", "718-7"], months: 1 }] },
  {
    id: "gentamicin", name: "gentamicin", match: /gentamicin/i, classes: ["aminoglycoside"],
    renal: { cautionBelow: 60, caution: "aminoglycosides are nephrotoxic; dose by weight and levels." },
  },
  {
    id: "amikacin", name: "amikacin", match: /amikacin/i, classes: ["aminoglycoside"],
    renal: { cautionBelow: 60, caution: "aminoglycosides are nephrotoxic; dose by weight and levels." },
  },
  { id: "tinidazole", name: "tinidazole", match: /tinidazole/i, classes: ["nitroimidazole"], maxDailyMg: 2000 },
  { id: "secnidazole", name: "secnidazole", match: /secnidazole/i, classes: ["nitroimidazole"], maxDailyMg: 2000 },
  { id: "ornidazole", name: "ornidazole", match: /ornidazole/i, classes: ["nitroimidazole"] },
  { id: "rifampicin", name: "rifampicin", match: /rifampicin|rifampin/i, classes: ["antituberculosis", "enzyme-inducer"] },
  { id: "isoniazid", name: "isoniazid", match: /isoniazid/i, classes: ["antituberculosis"] },
  { id: "pyrazinamide", name: "pyrazinamide", match: /pyrazinamide/i, classes: ["antituberculosis"] },
  { id: "ethambutol", name: "ethambutol", match: /ethambutol/i, classes: ["antituberculosis"], renal: { cautionBelow: 30, caution: "give ethambutol three times a week, not daily." } },
  // Antifungals, antivirals, antiparasitics
  {
    id: "fluconazole", name: "fluconazole", match: /fluconazole/i, classes: ["azole-antifungal", "qt-prolonging"], maxDailyMg: 800,
    renal: { cautionBelow: 50, caution: "halve fluconazole doses after the first for courses longer than one dose." },
  },
  { id: "itraconazole", name: "itraconazole", match: /itraconazole/i, classes: ["azole-antifungal", "cyp3a4-inhibitor"] },
  { id: "ketoconazole", name: "ketoconazole", match: /ketoconazole/i, classes: ["azole-antifungal", "cyp3a4-inhibitor", "qt-prolonging"] },
  { id: "terbinafine", name: "terbinafine", match: /terbinafine/i, classes: [], maxDailyMg: 250 },
  { id: "griseofulvin", name: "griseofulvin", match: /griseofulvin/i, classes: ["enzyme-inducer"] },
  {
    id: "acyclovir", name: "acyclovir", match: /\b(acyclovir|aciclovir)\b/i, classes: ["antiviral"], maxDailyMg: 4000,
    renal: { cautionBelow: 50, caution: "reduce the dose; kidney injury and confusion are more likely." },
  },
  {
    id: "valacyclovir", name: "valacyclovir", match: /valacyclovir|valaciclovir/i, classes: ["antiviral"],
    renal: { cautionBelow: 50, caution: "reduce the dose; kidney injury and confusion are more likely." },
  },
  { id: "ivermectin", name: "ivermectin", match: /ivermectin/i, classes: [] },
  { id: "mebendazole", name: "mebendazole", match: /mebendazole/i, classes: [] },
  { id: "nitazoxanide", name: "nitazoxanide", match: /nitazoxanide/i, classes: [], maxDailyMg: 1000 },
  { id: "hydroxychloroquine", name: "hydroxychloroquine", match: /hydroxychloroquine/i, classes: ["qt-prolonging"] },
  { id: "chloroquine", name: "chloroquine", match: /(?<!hydroxy)chloroquine/i, classes: ["qt-prolonging"] },

  // Stomach and gut
  { id: "rabeprazole", name: "rabeprazole", match: /rabeprazole/i, classes: ["ppi"] },
  { id: "lansoprazole", name: "lansoprazole", match: /lansoprazole/i, classes: ["ppi"] },
  { id: "famotidine", name: "famotidine", match: /famotidine/i, classes: ["h2-blocker"], renal: { cautionBelow: 50, caution: "halve the famotidine dose." } },
  { id: "ranitidine", name: "ranitidine", match: /ranitidine/i, classes: ["h2-blocker"], renal: { cautionBelow: 50, caution: "halve the ranitidine dose." } },
  { id: "metoclopramide", name: "metoclopramide", match: /metoclopramide/i, classes: ["antiemetic", "dopamine-antagonist"], maxDailyMg: 30, olderAdult: "movement disorders are more likely; avoid using it for more than a few days." },
  { id: "itopride", name: "itopride", match: /itopride/i, classes: [], maxDailyMg: 150 },
  { id: "drotaverine", name: "drotaverine", match: /drotaverine/i, classes: ["antispasmodic"], maxDailyMg: 240 },
  { id: "hyoscine", name: "hyoscine butylbromide", match: /hyoscine|scopolamine/i, classes: ["antispasmodic", "anticholinergic"], maxDailyMg: 100, olderAdult: "anticholinergic: confusion, retention and constipation." },
  { id: "mebeverine", name: "mebeverine", match: /mebeverine/i, classes: ["antispasmodic"], maxDailyMg: 405 },
  { id: "loperamide", name: "loperamide", match: /loperamide/i, classes: [], maxDailyMg: 16 },
  { id: "lactulose", name: "lactulose", match: /lactulose/i, classes: [] },
  { id: "sucralfate", name: "sucralfate", match: /sucralfate/i, classes: [], maxDailyMg: 8000 },
  { id: "ursodiol", name: "ursodeoxycholic acid", match: /ursodeoxycholic|ursodiol/i, classes: [] },

  // Heart and blood pressure
  { id: "telmisartan", name: "telmisartan", match: /telmisartan/i, classes: ["arb", "potassium-raising"], maxDailyMg: 80, monitor: [BMP] },
  { id: "olmesartan", name: "olmesartan", match: /olmesartan/i, classes: ["arb", "potassium-raising"], maxDailyMg: 40, monitor: [BMP] },
  { id: "valsartan", name: "valsartan", match: /valsartan/i, classes: ["arb", "potassium-raising"], maxDailyMg: 320, monitor: [BMP] },
  { id: "irbesartan", name: "irbesartan", match: /irbesartan/i, classes: ["arb", "potassium-raising"], maxDailyMg: 300, monitor: [BMP] },
  { id: "candesartan", name: "candesartan", match: /candesartan/i, classes: ["arb", "potassium-raising"], maxDailyMg: 32, monitor: [BMP] },
  { id: "enalapril", name: "enalapril", match: /enalapril/i, classes: ["ace-inhibitor", "potassium-raising"], maxDailyMg: 40, monitor: [BMP] },
  { id: "ramipril", name: "ramipril", match: /ramipril/i, classes: ["ace-inhibitor", "potassium-raising"], maxDailyMg: 10, monitor: [BMP] },
  { id: "captopril", name: "captopril", match: /captopril/i, classes: ["ace-inhibitor", "potassium-raising"], maxDailyMg: 150, monitor: [BMP] },
  { id: "perindopril", name: "perindopril", match: /perindopril/i, classes: ["ace-inhibitor", "potassium-raising"], maxDailyMg: 16, monitor: [BMP] },
  { id: "nifedipine", name: "nifedipine", match: /nifedipine/i, classes: ["calcium-channel-blocker"], maxDailyMg: 120, olderAdult: "avoid short-acting nifedipine: sudden drops in blood pressure." },
  { id: "atenolol", name: "atenolol", match: /atenolol/i, classes: ["beta-blocker"], maxDailyMg: 200, renal: { cautionBelow: 35, caution: "atenolol builds up; use a lower dose." } },
  { id: "propranolol", name: "propranolol", match: /propranolol/i, classes: ["beta-blocker"] },
  { id: "carvedilol", name: "carvedilol", match: /carvedilol/i, classes: ["beta-blocker"] },
  { id: "nebivolol", name: "nebivolol", match: /nebivolol/i, classes: ["beta-blocker"], maxDailyMg: 40 },
  { id: "hydrochlorothiazide", name: "hydrochlorothiazide", match: /hydrochlorothiazide/i, classes: ["thiazide"], maxDailyMg: 100, renal: { cautionBelow: 30, caution: "thiazides work poorly; consider a loop diuretic." }, monitor: [BMP] },
  { id: "indapamide", name: "indapamide", match: /indapamide/i, classes: ["thiazide"], maxDailyMg: 5, renal: { cautionBelow: 30, caution: "thiazides work poorly; consider a loop diuretic." }, monitor: [BMP] },
  { id: "chlorthalidone", name: "chlorthalidone", match: /chlorthalidone|chlortalidone/i, classes: ["thiazide"], renal: { cautionBelow: 30, caution: "thiazides work poorly; consider a loop diuretic." }, monitor: [BMP] },
  {
    id: "spironolactone", name: "spironolactone", match: /spironolactone/i, classes: ["potassium-sparing", "potassium-raising"], maxDailyMg: 400,
    renal: { stopBelow: 30, cautionBelow: 45, stop: "Spironolactone is not recommended", caution: "potassium can rise quickly; check it within a week." },
    monitor: [{ ...BMP, months: 6 }],
  },
  { id: "torsemide", name: "torsemide", match: /torsemide|torasemide/i, classes: ["loop-diuretic"], monitor: [{ ...BMP, months: 6 }] },
  { id: "ticagrelor", name: "ticagrelor", match: /ticagrelor/i, classes: ["antiplatelet"], maxDailyMg: 180 },
  { id: "prasugrel", name: "prasugrel", match: /prasugrel/i, classes: ["antiplatelet"], maxDailyMg: 10, olderAdult: "bleeding risk is higher at 75 and over; 5 mg a day is usual." },
  {
    id: "rivaroxaban", name: "rivaroxaban", match: /rivaroxaban/i, classes: ["anticoagulant"], maxDailyMg: 30,
    renal: { stopBelow: 15, cautionBelow: 50, stop: "Rivaroxaban is not recommended", caution: "check the rivaroxaban dose for kidney function." },
    monitor: [{ label: "CBC and creatinine", codes: ["58410-2", "718-7"], months: 12 }, BMP],
  },
  {
    id: "dabigatran", name: "dabigatran", match: /dabigatran/i, classes: ["anticoagulant"], maxDailyMg: 300,
    renal: { stopBelow: 30, cautionBelow: 50, stop: "Dabigatran is contraindicated", caution: "consider 110 mg twice daily; dabigatran is cleared by the kidneys." },
    monitor: [{ label: "CBC and creatinine", codes: ["58410-2", "718-7"], months: 12 }, BMP],
  },
  {
    id: "edoxaban", name: "edoxaban", match: /edoxaban/i, classes: ["anticoagulant"], maxDailyMg: 60,
    renal: { stopBelow: 15, cautionBelow: 50, stop: "Edoxaban is not recommended", caution: "use 30 mg once daily." },
  },
  { id: "enoxaparin", name: "enoxaparin", match: /enoxaparin/i, classes: ["anticoagulant"], renal: { cautionBelow: 30, caution: "give enoxaparin once daily at a reduced dose and watch for bleeding." } },
  { id: "heparin", name: "heparin", match: /(?<!low molecular weight )\bheparin\b/i, classes: ["anticoagulant"] },
  { id: "simvastatin", name: "simvastatin", match: /simvastatin/i, classes: ["statin"], maxDailyMg: 80, monitor: [LIPIDS] },
  { id: "fenofibrate", name: "fenofibrate", match: /fenofibrate/i, classes: ["fibrate"], renal: { cautionBelow: 30, caution: "avoid fenofibrate below eGFR 30." } },
  { id: "nitrate", name: "isosorbide mononitrate", match: /isosorbide|nitroglycerin|glyceryl trinitrate/i, classes: ["nitrate"], maxDailyMg: 240 },
  { id: "trimetazidine", name: "trimetazidine", match: /trimetazidine/i, classes: [], maxDailyMg: 70, renal: { cautionBelow: 30, caution: "trimetazidine is contraindicated below eGFR 30." } },
  { id: "ivabradine", name: "ivabradine", match: /ivabradine/i, classes: ["qt-prolonging"], maxDailyMg: 15 },
  {
    id: "digoxin", name: "digoxin", match: /digoxin/i, classes: ["cardiac-glycoside"],
    renal: { cautionBelow: 50, caution: "lower the digoxin dose and check a level." },
    olderAdult: "avoid more than 125 micrograms a day.",
  },
  { id: "amiodarone", name: "amiodarone", match: /amiodarone/i, classes: ["antiarrhythmic", "qt-prolonging"], monitor: [{ label: "TSH", codes: ["3016-3"], months: 6 }] },

  // Diabetes
  { id: "glimepiride", name: "glimepiride", match: /glimepiride/i, classes: ["sulfonylurea", "glucose-lowering"], maxDailyMg: 8, renal: { cautionBelow: 30, caution: "hypoglycemia is more likely; start low." }, olderAdult: "sulfonylureas cause prolonged hypoglycemia." },
  { id: "glibenclamide", name: "glibenclamide", match: /glibenclamide|glyburide/i, classes: ["sulfonylurea", "glucose-lowering"], maxDailyMg: 20, renal: { cautionBelow: 60, caution: "glibenclamide is long-acting; prefer gliclazide." }, olderAdult: "glibenclamide causes prolonged hypoglycemia; prefer gliclazide." },
  { id: "sitagliptin", name: "sitagliptin", match: /sitagliptin/i, classes: ["dpp4-inhibitor", "glucose-lowering"], maxDailyMg: 100, renal: { cautionBelow: 45, caution: "use 50 mg a day (25 mg below eGFR 30)." } },
  { id: "linagliptin", name: "linagliptin", match: /linagliptin/i, classes: ["dpp4-inhibitor", "glucose-lowering"], maxDailyMg: 5 },
  { id: "vildagliptin", name: "vildagliptin", match: /vildagliptin/i, classes: ["dpp4-inhibitor", "glucose-lowering"], maxDailyMg: 100, renal: { cautionBelow: 50, caution: "use 50 mg once daily." } },
  { id: "teneligliptin", name: "teneligliptin", match: /teneligliptin/i, classes: ["dpp4-inhibitor", "glucose-lowering"], maxDailyMg: 40 },
  { id: "empagliflozin", name: "empagliflozin", match: /empagliflozin/i, classes: ["sglt2-inhibitor", "glucose-lowering"], maxDailyMg: 25, renal: { cautionBelow: 45, caution: "little glucose lowering at this eGFR; continue only for heart or kidney protection." } },
  { id: "dapagliflozin", name: "dapagliflozin", match: /dapagliflozin/i, classes: ["sglt2-inhibitor", "glucose-lowering"], maxDailyMg: 10, renal: { cautionBelow: 45, caution: "little glucose lowering at this eGFR; continue only for heart or kidney protection." } },
  { id: "pioglitazone", name: "pioglitazone", match: /pioglitazone/i, classes: ["glucose-lowering"], maxDailyMg: 45, olderAdult: "can cause fluid retention and worsen heart failure." },
  { id: "acarbose", name: "acarbose", match: /acarbose/i, classes: ["glucose-lowering"], maxDailyMg: 600, renal: { stopBelow: 25, stop: "Acarbose is not recommended" } },

  // Allergy, cough and lungs
  { id: "loratadine", name: "loratadine", match: /(?<!des)loratadine/i, classes: ["antihistamine"] },
  { id: "desloratadine", name: "desloratadine", match: /desloratadine/i, classes: ["antihistamine"] },
  { id: "levocetirizine", name: "levocetirizine", match: /levocetirizine/i, classes: ["antihistamine"] },
  { id: "rupatadine", name: "rupatadine", match: /rupatadine/i, classes: ["antihistamine"] },
  { id: "chlorphenamine", name: "chlorphenamine", match: /chlorphenamine|chlorpheniramine/i, classes: ["antihistamine", "anticholinergic", "cns-depressant"], maxDailyMg: 24, olderAdult: "first-generation antihistamines cause confusion and falls." },
  { id: "hydroxyzine", name: "hydroxyzine", match: /hydroxyzine/i, classes: ["antihistamine", "anticholinergic", "cns-depressant", "qt-prolonging"], olderAdult: "first-generation antihistamines cause confusion and falls." },
  { id: "promethazine", name: "promethazine", match: /promethazine/i, classes: ["antihistamine", "anticholinergic", "cns-depressant"], olderAdult: "first-generation antihistamines cause confusion and falls." },
  { id: "budesonide", name: "budesonide", match: /budesonide/i, classes: ["inhaled-steroid"] },
  { id: "beclomethasone", name: "beclomethasone", match: /beclomethasone|beclometasone/i, classes: ["inhaled-steroid"] },
  { id: "salmeterol", name: "salmeterol", match: /salmeterol/i, classes: ["laba"] },
  { id: "formoterol", name: "formoterol", match: /formoterol/i, classes: ["laba"] },
  { id: "ipratropium", name: "ipratropium", match: /ipratropium/i, classes: ["inhaled-anticholinergic"] },
  { id: "theophylline", name: "theophylline", match: /theophylline|aminophylline/i, classes: ["methylxanthine"] },
  { id: "doxofylline", name: "doxofylline", match: /doxofylline/i, classes: ["methylxanthine"], maxDailyMg: 1200 },
  { id: "ambroxol", name: "ambroxol", match: /ambroxol/i, classes: [], maxDailyMg: 120 },
  { id: "bromhexine", name: "bromhexine", match: /bromhexine/i, classes: [], maxDailyMg: 48 },
  { id: "dextromethorphan", name: "dextromethorphan", match: /dextromethorphan/i, classes: ["serotonergic"], maxDailyMg: 120 },

  // Pain, gout, muscles
  {
    id: "diclofenac", name: "diclofenac", match: /diclofenac/i, classes: ["nsaid"], maxDailyMg: 150,
    renal: { cautionBelow: 45, caution: "NSAIDs can worsen kidney function." },
    olderAdult: "avoid regular NSAID use; GI bleeding and kidney injury are more likely.",
  },
  {
    id: "aceclofenac", name: "aceclofenac", match: /aceclofenac/i, classes: ["nsaid"], maxDailyMg: 200,
    renal: { cautionBelow: 45, caution: "NSAIDs can worsen kidney function." },
    olderAdult: "avoid regular NSAID use; GI bleeding and kidney injury are more likely.",
  },
  {
    id: "ketorolac", name: "ketorolac", match: /ketorolac/i, classes: ["nsaid"], maxDailyMg: 90, maxDailyMgOlder: 60,
    renal: { stopBelow: 30, cautionBelow: 60, stop: "Ketorolac is contraindicated", caution: "ketorolac can cause kidney injury; keep it to 5 days or less." },
    olderAdult: "avoid ketorolac; bleeding and kidney injury are much more likely.",
  },
  {
    id: "etoricoxib", name: "etoricoxib", match: /etoricoxib/i, classes: ["nsaid"], maxDailyMg: 120,
    renal: { stopBelow: 30, cautionBelow: 45, stop: "Etoricoxib is not recommended", caution: "NSAIDs can worsen kidney function." },
    olderAdult: "avoid regular NSAID use; GI bleeding and kidney injury are more likely.",
  },
  {
    id: "celecoxib", name: "celecoxib", match: /celecoxib/i, classes: ["nsaid"], maxDailyMg: 400,
    renal: { cautionBelow: 45, caution: "NSAIDs can worsen kidney function." },
    olderAdult: "avoid regular NSAID use; GI bleeding and kidney injury are more likely.",
  },
  {
    id: "mefenamic-acid", name: "mefenamic acid", match: /mefenamic/i, classes: ["nsaid"], maxDailyMg: 1500,
    renal: { cautionBelow: 45, caution: "NSAIDs can worsen kidney function." },
    olderAdult: "avoid regular NSAID use; GI bleeding and kidney injury are more likely.",
  },
  {
    id: "indomethacin", name: "indomethacin", match: /indomethacin|indometacin/i, classes: ["nsaid"], maxDailyMg: 200,
    renal: { cautionBelow: 45, caution: "NSAIDs can worsen kidney function." },
    olderAdult: "avoid indomethacin; it has the most side effects of the NSAIDs.",
  },
  {
    id: "morphine", name: "morphine", match: /morphine/i, classes: ["opioid", "cns-depressant"], controlled: true,
    renal: { cautionBelow: 30, caution: "morphine's metabolites build up; use a lower dose or another opioid." },
    olderAdult: "opioids raise fall and confusion risk.",
  },
  { id: "pethidine", name: "pethidine", match: /pethidine|meperidine/i, classes: ["opioid", "serotonergic", "cns-depressant"], controlled: true, olderAdult: "avoid pethidine; it causes confusion and seizures." },
  { id: "tapentadol", name: "tapentadol", match: /tapentadol/i, classes: ["opioid", "serotonergic", "cns-depressant"], controlled: true, olderAdult: "opioids raise fall and confusion risk." },
  { id: "pregabalin", name: "pregabalin", match: /pregabalin/i, classes: ["gabapentinoid", "cns-depressant"], maxDailyMg: 600, renal: { cautionBelow: 60, caution: "reduce the pregabalin dose." } },
  { id: "gabapentin", name: "gabapentin", match: /gabapentin/i, classes: ["gabapentinoid", "cns-depressant"], maxDailyMg: 3600, renal: { cautionBelow: 60, caution: "reduce the gabapentin dose." } },
  { id: "tolperisone", name: "tolperisone", match: /tolperisone/i, classes: ["muscle-relaxant"], maxDailyMg: 450 },
  { id: "baclofen", name: "baclofen", match: /baclofen/i, classes: ["muscle-relaxant", "cns-depressant"], maxDailyMg: 100, renal: { cautionBelow: 50, caution: "baclofen builds up and causes drowsiness and confusion; use a much lower dose." } },
  { id: "colchicine", name: "colchicine", match: /colchicine/i, classes: [], maxDailyMg: 3, renal: { cautionBelow: 50, caution: "reduce the colchicine dose; toxicity is more likely." } },
  { id: "febuxostat", name: "febuxostat", match: /febuxostat/i, classes: ["xanthine-oxidase-inhibitor"], maxDailyMg: 120, monitor: [{ label: "Uric acid", codes: ["3084-1"], months: 12 }] },
  { id: "methotrexate", name: "methotrexate", match: /methotrexate/i, classes: [], renal: { stopBelow: 30, cautionBelow: 60, stop: "Methotrexate is contraindicated", caution: "reduce the methotrexate dose." }, monitor: [{ label: "CBC and liver tests", codes: ["58410-2", "24323-8"], months: 3 }] },

  // Mind, sleep, nerves
  { id: "escitalopram", name: "escitalopram", match: /escitalopram/i, classes: ["ssri", "serotonergic", "qt-prolonging"], maxDailyMg: 20, maxDailyMgOlder: 10 },
  { id: "citalopram", name: "citalopram", match: /(?<!es)citalopram/i, classes: ["ssri", "serotonergic", "qt-prolonging"], maxDailyMg: 40, maxDailyMgOlder: 20 },
  { id: "fluoxetine", name: "fluoxetine", match: /fluoxetine/i, classes: ["ssri", "serotonergic"], maxDailyMg: 80 },
  { id: "paroxetine", name: "paroxetine", match: /paroxetine/i, classes: ["ssri", "serotonergic"], maxDailyMg: 60, olderAdult: "paroxetine is anticholinergic: confusion and falls." },
  { id: "mirtazapine", name: "mirtazapine", match: /mirtazapine/i, classes: ["serotonergic", "cns-depressant"], maxDailyMg: 45 },
  { id: "amitriptyline", name: "amitriptyline", match: /amitriptyline/i, classes: ["tca", "serotonergic", "qt-prolonging", "anticholinergic", "cns-depressant"], olderAdult: "strongly anticholinergic and sedating: confusion and falls." },
  { id: "nortriptyline", name: "nortriptyline", match: /nortriptyline/i, classes: ["tca", "serotonergic", "qt-prolonging", "anticholinergic", "cns-depressant"], maxDailyMg: 150, olderAdult: "anticholinergic and sedating: confusion and falls." },
  { id: "clonazepam", name: "clonazepam", match: /clonazepam/i, classes: ["benzodiazepine", "cns-depressant"], controlled: true, maxDailyMg: 20, olderAdult: "benzodiazepines raise falls, fractures and confusion." },
  { id: "diazepam", name: "diazepam", match: /diazepam/i, classes: ["benzodiazepine", "cns-depressant"], controlled: true, olderAdult: "benzodiazepines raise falls, fractures and confusion." },
  { id: "alprazolam", name: "alprazolam", match: /alprazolam/i, classes: ["benzodiazepine", "cns-depressant"], controlled: true, maxDailyMg: 10, olderAdult: "benzodiazepines raise falls, fractures and confusion." },
  { id: "lorazepam", name: "lorazepam", match: /lorazepam/i, classes: ["benzodiazepine", "cns-depressant"], controlled: true, olderAdult: "benzodiazepines raise falls, fractures and confusion." },
  { id: "bromazepam", name: "bromazepam", match: /bromazepam/i, classes: ["benzodiazepine", "cns-depressant"], controlled: true, olderAdult: "benzodiazepines raise falls, fractures and confusion." },
  { id: "midazolam", name: "midazolam", match: /midazolam/i, classes: ["benzodiazepine", "cns-depressant"], controlled: true, olderAdult: "benzodiazepines raise falls, fractures and confusion." },
  { id: "zolpidem", name: "zolpidem", match: /zolpidem/i, classes: ["hypnotic", "cns-depressant"], controlled: true, maxDailyMg: 10, maxDailyMgOlder: 5, olderAdult: "sleeping pills raise falls and confusion." },
  { id: "olanzapine", name: "olanzapine", match: /olanzapine/i, classes: ["antipsychotic", "cns-depressant"], maxDailyMg: 20, olderAdult: "antipsychotics raise stroke and death risk in dementia; use only if needed." },
  { id: "risperidone", name: "risperidone", match: /risperidone/i, classes: ["antipsychotic", "cns-depressant"], maxDailyMg: 16, olderAdult: "antipsychotics raise stroke and death risk in dementia; use only if needed." },
  { id: "quetiapine", name: "quetiapine", match: /quetiapine/i, classes: ["antipsychotic", "cns-depressant", "qt-prolonging"], maxDailyMg: 800, olderAdult: "antipsychotics raise stroke and death risk in dementia; use only if needed." },
  { id: "haloperidol", name: "haloperidol", match: /haloperidol/i, classes: ["antipsychotic", "cns-depressant", "qt-prolonging"], olderAdult: "antipsychotics raise stroke and death risk in dementia; use only if needed." },
  { id: "valproate", name: "valproate", match: /valpro/i, classes: ["antiepileptic"] },
  { id: "carbamazepine", name: "carbamazepine", match: /carbamazepine/i, classes: ["antiepileptic", "enzyme-inducer"], maxDailyMg: 2000 },
  { id: "levetiracetam", name: "levetiracetam", match: /levetiracetam/i, classes: ["antiepileptic"], maxDailyMg: 3000, renal: { cautionBelow: 50, caution: "reduce the levetiracetam dose." } },
  { id: "phenytoin", name: "phenytoin", match: /phenytoin/i, classes: ["antiepileptic", "enzyme-inducer"] },
  { id: "lamotrigine", name: "lamotrigine", match: /lamotrigine/i, classes: ["antiepileptic"] },
  { id: "flunarizine", name: "flunarizine", match: /flunarizine/i, classes: [], maxDailyMg: 10, olderAdult: "flunarizine can cause depression and movement disorders." },
  { id: "betahistine", name: "betahistine", match: /betahistine/i, classes: [], maxDailyMg: 48 },
  {
    id: "lithium", name: "lithium", match: /lithium/i, classes: ["lithium"],
    renal: { stopBelow: 30, cautionBelow: 60, stop: "Lithium should be avoided", caution: "reduce the dose and check lithium levels often." },
    monitor: [BMP, { label: "TSH", codes: ["3016-3"], months: 6 }],
  },

  // Hormones and steroids
  { id: "prednisolone", name: "prednisolone", match: /(?<!methyl)prednisolone/i, classes: ["corticosteroid"] },
  { id: "methylprednisolone", name: "methylprednisolone", match: /methylprednisolone/i, classes: ["corticosteroid"] },
  { id: "dexamethasone", name: "dexamethasone", match: /dexamethasone/i, classes: ["corticosteroid"] },
  { id: "hydrocortisone", name: "hydrocortisone", match: /hydrocortisone/i, classes: ["corticosteroid"] },
  { id: "carbimazole", name: "carbimazole", match: /carbimazole|thiamazole|methimazole/i, classes: ["antithyroid"], monitor: [{ label: "TSH", codes: ["3016-3"], months: 3 }] },

  // Urology, blood, vitamins
  { id: "finasteride", name: "finasteride", match: /finasteride/i, classes: [], maxDailyMg: 5 },
  { id: "sildenafil", name: "sildenafil", match: /sildenafil/i, classes: ["pde5-inhibitor"], maxDailyMg: 100 },
  { id: "tadalafil", name: "tadalafil", match: /tadalafil/i, classes: ["pde5-inhibitor"], maxDailyMg: 40 },
  { id: "solifenacin", name: "solifenacin", match: /solifenacin/i, classes: ["anticholinergic"], maxDailyMg: 10, renal: { cautionBelow: 30, caution: "no more than 5 mg a day." }, olderAdult: "anticholinergic: confusion and constipation." },
  { id: "tranexamic-acid", name: "tranexamic acid", match: /tranexamic/i, classes: [], renal: { cautionBelow: 50, caution: "reduce the tranexamic acid dose." } },
  { id: "folic-acid", name: "folic acid", match: /folic acid|folate/i, classes: [] },
  { id: "zinc", name: "zinc", match: /\bzinc\b/i, classes: [] },
];

export function ingredientsOf(drug: string): Ingredient[] {
  return INGREDIENTS.filter((i) => i.match.test(drug));
}

export const classesOf = (drug: string) => [...new Set(ingredientsOf(drug).flatMap((i) => i.classes))];

// Allergy entries are free text; map common ones to the drug classes they cover.
const allergyClasses: [RegExp, string[]][] = [
  [/penicillin|amoxicillin|ampicillin|augmentin|cloxacillin|moxacil|fimoxyl/i, ["penicillin"]],
  [/cephalosporin|cephalexin|cefdinir|ceftriaxone|cefixime|cefuroxime|cefradine|cephradine|cefpodoxime|cefaclor|ceftazidime|cefepime|keflex/i, ["cephalosporin"]],
  [/quinolone|ciprofloxacin|levofloxacin|ofloxacin|moxifloxacin/i, ["fluoroquinolone"]],
  [/metronidazole|flagyl/i, ["nitroimidazole"]],
  [/sulfa|sulfamethoxazole|bactrim/i, ["sulfonamide"]],
  [/codeine/i, ["codeine"]],
  [/morphine|oxycodone|hydrocodone|opioid/i, ["opioid"]],
  [/nsaid|ibuprofen|naproxen|diclofenac|aceclofenac|ketorolac|etoricoxib|celecoxib|mefenamic|indomethacin/i, ["nsaid"]],
  [/aspirin|salicylate/i, ["salicylate", "nsaid"]],
  [/macrolide|azithromycin|erythromycin|clarithromycin/i, ["macrolide"]],
  [/statin/i, ["statin"]],
  [/ace inhibitor|lisinopril|enalapril|ramipril|captopril|perindopril/i, ["ace-inhibitor"]],
  [/tetracycline|doxycycline/i, ["tetracycline"]],
  [/benzodiazepine|diazepam|clonazepam|alprazolam|lorazepam|bromazepam|midazolam/i, ["benzodiazepine"]],
  [/contrast|iodine/i, ["iodinated-contrast"]],
];

export function classesForAllergy(substance: string) {
  return allergyClasses.flatMap(([re, classes]) => (re.test(substance) ? classes : []));
}

export type Interaction = { a: string; b: string; level: "stop" | "caution"; text: string };

// `a` and `b` are an ingredient id or "class:<class>". Order doesn't matter.
export const INTERACTIONS: Interaction[] = [
  { a: "class:nsaid", b: "class:anticoagulant", level: "stop", text: "Major bleeding risk with an NSAID and an anticoagulant. Prefer acetaminophen; if an NSAID is needed, keep it short and add a PPI." },
  { a: "class:nsaid", b: "class:antiplatelet", level: "caution", text: "Higher GI bleeding risk; ibuprofen can also blunt aspirin's heart protection." },
  { a: "class:anticoagulant", b: "class:antiplatelet", level: "caution", text: "Added bleeding risk. Confirm both are still indicated." },
  { a: "class:ace-inhibitor", b: "class:arb", level: "stop", text: "Dual RAAS blockade raises the risk of hyperkalemia and kidney injury without added benefit." },
  { a: "sulfamethoxazole", b: "class:potassium-raising", level: "caution", text: "Trimethoprim raises potassium; check a potassium level if the course is more than a few days." },
  { a: "class:nsaid", b: "class:ace-inhibitor", level: "caution", text: "NSAIDs blunt the blood pressure effect and can cause kidney injury, especially with a diuretic." },
  { a: "class:nsaid", b: "class:arb", level: "caution", text: "NSAIDs blunt the blood pressure effect and can cause kidney injury, especially with a diuretic." },
  { a: "class:nsaid", b: "class:corticosteroid", level: "caution", text: "Higher risk of GI bleeding and ulcers together." },
  { a: "class:corticosteroid", b: "class:glucose-lowering", level: "caution", text: "Steroids raise blood glucose; check sugars more often during the course." },
  { a: "clarithromycin", b: "atorvastatin", level: "stop", text: "Clarithromycin raises atorvastatin levels (rhabdomyolysis risk). Hold the statin during the course or use azithromycin." },
  { a: "clarithromycin", b: "class:anticoagulant", level: "caution", text: "Clarithromycin raises anticoagulant levels and bleeding risk." },
  { a: "class:opioid", b: "class:muscle-relaxant", level: "caution", text: "Additive sedation and breathing suppression with an opioid and a muscle relaxant." },
  { a: "class:serotonergic", b: "class:serotonergic", level: "caution", text: "Two serotonergic drugs: watch for serotonin syndrome (agitation, tremor, fever)." },
  { a: "class:qt-prolonging", b: "class:qt-prolonging", level: "caution", text: "Both prolong the QT interval; consider an ECG if there are other risk factors." },
  { a: "levothyroxine", b: "class:iron", level: "caution", text: "Iron reduces levothyroxine absorption. Take them at least 4 hours apart." },
  { a: "levothyroxine", b: "class:calcium", level: "caution", text: "Calcium reduces levothyroxine absorption. Take them at least 4 hours apart." },
  { a: "class:sulfonylurea", b: "class:insulin", level: "caution", text: "Higher risk of hypoglycemia together." },
  { a: "metronidazole", b: "warfarin", level: "stop", text: "Metronidazole sharply raises the INR on warfarin. Avoid, or reduce the warfarin dose and check the INR within a few days." },
  { a: "class:fluoroquinolone", b: "warfarin", level: "caution", text: "Fluoroquinolones can raise the INR on warfarin; check it during the course." },
  { a: "class:fluoroquinolone", b: "class:iron", level: "caution", text: "Iron blocks fluoroquinolone absorption. Take the antibiotic 2 hours before or 6 hours after." },
  { a: "class:fluoroquinolone", b: "class:calcium", level: "caution", text: "Calcium blocks fluoroquinolone absorption. Take the antibiotic 2 hours before or 6 hours after." },
  { a: "class:benzodiazepine", b: "class:opioid", level: "stop", text: "An opioid with a benzodiazepine can stop breathing. Avoid, or use the lowest doses for the shortest time." },
  { a: "class:hypnotic", b: "class:opioid", level: "caution", text: "Additive sedation and breathing suppression with an opioid and a sleeping pill." },
  { a: "class:gabapentinoid", b: "class:opioid", level: "caution", text: "Pregabalin or gabapentin with an opioid adds sedation and can suppress breathing." },
  { a: "class:cyp3a4-inhibitor", b: "simvastatin", level: "stop", text: "This raises simvastatin levels (rhabdomyolysis risk). Hold simvastatin during the course or choose another drug." },
  { a: "amiodarone", b: "simvastatin", level: "caution", text: "Keep simvastatin at 20 mg a day or less with amiodarone." },
  { a: "amiodarone", b: "warfarin", level: "stop", text: "Amiodarone raises the INR on warfarin sharply. Reduce the warfarin dose and check the INR weekly." },
  { a: "amiodarone", b: "digoxin", level: "stop", text: "Amiodarone roughly doubles digoxin levels. Halve the digoxin dose and check a level." },
  { a: "class:macrolide", b: "digoxin", level: "caution", text: "Macrolides raise digoxin levels; watch for toxicity." },
  { a: "class:loop-diuretic", b: "digoxin", level: "caution", text: "Low potassium from the diuretic makes digoxin toxicity more likely; check potassium." },
  { a: "class:thiazide", b: "digoxin", level: "caution", text: "Low potassium from the diuretic makes digoxin toxicity more likely; check potassium." },
  { a: "class:potassium-sparing", b: "class:potassium-raising", level: "caution", text: "Both raise potassium; check it within a week of starting." },
  { a: "class:tetracycline", b: "class:iron", level: "caution", text: "Iron blocks doxycycline absorption. Take them 2 to 3 hours apart." },
  { a: "class:tetracycline", b: "class:calcium", level: "caution", text: "Calcium blocks doxycycline absorption. Take them 2 to 3 hours apart." },
  { a: "fluconazole", b: "warfarin", level: "stop", text: "Fluconazole sharply raises the INR on warfarin. Avoid, or reduce warfarin and check the INR within a few days." },
  { a: "class:azole-antifungal", b: "class:anticoagulant", level: "caution", text: "Azole antifungals raise anticoagulant levels and bleeding risk." },
  { a: "rifampicin", b: "class:anticoagulant", level: "stop", text: "Rifampicin greatly lowers anticoagulant levels. Avoid together, or check the INR closely on warfarin." },
  { a: "class:enzyme-inducer", b: "class:anticoagulant", level: "caution", text: "This lowers anticoagulant levels; check the INR, or choose another drug with a DOAC." },
  { a: "class:pde5-inhibitor", b: "class:nitrate", level: "stop", text: "Sildenafil or tadalafil with a nitrate can drop blood pressure dangerously. Never together." },
  { a: "colchicine", b: "class:cyp3a4-inhibitor", level: "stop", text: "This raises colchicine to toxic, sometimes fatal, levels. Avoid together, or hold colchicine." },
  { a: "lithium", b: "class:nsaid", level: "caution", text: "NSAIDs raise lithium levels; check a level, or use paracetamol." },
  { a: "lithium", b: "class:ace-inhibitor", level: "caution", text: "ACE inhibitors raise lithium levels; check a level." },
  { a: "lithium", b: "class:arb", level: "caution", text: "ARBs raise lithium levels; check a level." },
  { a: "lithium", b: "class:thiazide", level: "caution", text: "Thiazides raise lithium levels; check a level." },
  { a: "methotrexate", b: "sulfamethoxazole", level: "stop", text: "Trimethoprim with methotrexate can cause severe bone marrow suppression. Avoid together." },
  { a: "methotrexate", b: "class:nsaid", level: "caution", text: "NSAIDs raise methotrexate levels; check blood counts and kidney function." },
  { a: "clopidogrel", b: "omeprazole", level: "caution", text: "Omeprazole weakens clopidogrel. Use pantoprazole instead." },
  { a: "clopidogrel", b: "esomeprazole", level: "caution", text: "Esomeprazole weakens clopidogrel. Use pantoprazole instead." },
  { a: "class:ssri", b: "class:anticoagulant", level: "caution", text: "SSRIs add to bleeding risk with an anticoagulant." },
  { a: "class:ssri", b: "class:nsaid", level: "caution", text: "Higher GI bleeding risk with an SSRI and an NSAID; consider a PPI." },
  { a: "linezolid", b: "class:ssri", level: "stop", text: "Linezolid with an SSRI can cause serotonin syndrome. Avoid, or stop the SSRI during the course." },
  { a: "theophylline", b: "class:fluoroquinolone", level: "caution", text: "Fluoroquinolones raise theophylline levels; watch for nausea, palpitations and seizures." },
  { a: "theophylline", b: "class:macrolide", level: "caution", text: "Macrolides raise theophylline levels; watch for toxicity." },
  { a: "class:fluoroquinolone", b: "class:corticosteroid", level: "caution", text: "Higher risk of tendon rupture with a fluoroquinolone and a steroid, especially over 60." },
];

// Two different drugs from one of these classes is usually a duplicate.
export const DUPLICATE_CLASSES: Record<string, string> = {
  statin: "statins",
  "ace-inhibitor": "ACE inhibitors",
  arb: "ARBs",
  ssri: "SSRIs",
  ppi: "proton pump inhibitors",
  antihistamine: "antihistamines",
  fluoroquinolone: "fluoroquinolones",
  nsaid: "NSAIDs",
  "beta-blocker": "beta blockers",
  anticoagulant: "anticoagulants",
  sulfonylurea: "sulfonylureas",
  opioid: "opioids",
  "dpp4-inhibitor": "DPP-4 inhibitors",
  "sglt2-inhibitor": "SGLT2 inhibitors",
  benzodiazepine: "benzodiazepines",
  antipsychotic: "antipsychotics",
  "h2-blocker": "H2 blockers",
  "xanthine-oxidase-inhibitor": "urate-lowering drugs",
  tca: "tricyclic antidepressants",
  "calcium-channel-blocker": "calcium channel blockers",
  macrolide: "macrolides",
  cephalosporin: "cephalosporins",
  nitroimidazole: "nitroimidazoles",
  thiazide: "thiazide diuretics",
  "loop-diuretic": "loop diuretics",
  "pde5-inhibitor": "PDE5 inhibitors",
};

const matchesKey = (ing: Ingredient, key: string) => (key.startsWith("class:") ? ing.classes.includes(key.slice(6)) : ing.id === key);

// The interactions between two drugs, by name.
export function interactionsBetween(drugA: string, drugB: string): Interaction[] {
  const as = ingredientsOf(drugA);
  const bs = ingredientsOf(drugB);
  const out: Interaction[] = [];
  for (const rule of INTERACTIONS) {
    const hit =
      as.some((x) => bs.some((y) => x.id !== y.id && ((matchesKey(x, rule.a) && matchesKey(y, rule.b)) || (matchesKey(x, rule.b) && matchesKey(y, rule.a)))));
    if (hit && !out.includes(rule)) out.push(rule);
  }
  return out;
}
