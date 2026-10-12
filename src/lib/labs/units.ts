import type { Analyte } from "./catalog";

// Printed unit → UCUM. Keys are lowercased with spaces removed and µ written as u.
const UNIT_MAP: Record<string, string> = {
  "k/ul": "10*3/uL",
  "x10^3/ul": "10*3/uL",
  "x103/ul": "10*3/uL",
  "10^3/ul": "10*3/uL",
  "10*3/ul": "10*3/uL",
  "10e3/ul": "10*3/uL",
  "x10e3/ul": "10*3/uL",
  "thou/ul": "10*3/uL",
  "thou/cumm": "10*3/uL",
  "x10^3/cumm": "10*3/uL",
  "10^3/cumm": "10*3/uL",
  "x10^3/mm3": "10*3/uL",
  "10^9/l": "10*3/uL",
  "x10^9/l": "10*3/uL",
  "x109/l": "10*3/uL",
  "10*9/l": "10*3/uL",
  "m/ul": "10*6/uL",
  "x10^6/ul": "10*6/uL",
  "10^6/ul": "10*6/uL",
  "10*6/ul": "10*6/uL",
  "mill/ul": "10*6/uL",
  "million/ul": "10*6/uL",
  "mill/cumm": "10*6/uL",
  "million/cumm": "10*6/uL",
  "x10^6/cumm": "10*6/uL",
  "10^12/l": "10*6/uL",
  "x10^12/l": "10*6/uL",
  "x1012/l": "10*6/uL",
  "/cumm": "/uL",
  "/cmm": "/uL",
  "cells/cumm": "/uL",
  "/mm3": "/uL",
  "/ul": "/uL",
  "cells/ul": "/uL",
  "lakh/cumm": "10*5/uL",
  "lakhs/cumm": "10*5/uL",
  "lac/cumm": "10*5/uL",
  "g/dl": "g/dL",
  "gm/dl": "g/dL",
  "gm%": "g/dL",
  "g%": "g/dL",
  "g/l": "g/L",
  "gm/l": "g/L",
  "mg/dl": "mg/dL",
  "mg%": "mg/dL",
  "mg/l": "mg/L",
  "mmol/l": "mmol/L",
  "umol/l": "umol/L",
  "nmol/l": "nmol/L",
  "pmol/l": "pmol/L",
  "meq/l": "meq/L",
  "%": "%",
  "fl": "fL",
  "cu.microns": "fL",
  "pg": "pg",
  "picograms": "pg",
  "u/l": "U/L",
  "iu/l": "U/L",
  "units/l": "U/L",
  "u/litre": "U/L",
  "ng/ml": "ng/mL",
  "pg/ml": "pg/mL",
  "ng/dl": "ng/dL",
  "ug/dl": "ug/dL",
  "mcg/dl": "ug/dL",
  "uiu/ml": "m[IU]/L",
  "miu/l": "m[IU]/L",
  "miu/ml": "m[IU]/mL",
  "mm/hr": "mm/h",
  "mm/h": "mm/h",
  "mm/1sthr": "mm/h",
  "mmin1sthr": "mm/h",
  "mm/1sthour": "mm/h",
  "mmafter1hr": "mm/h",
  "ml/min/1.73m2": "mL/min/1.73m2",
  "ml/min/1.73m^2": "mL/min/1.73m2",
  "ml/min/1.73m²": "mL/min/1.73m2",
  "ml/min": "mL/min",
};

export function normalizeUnit(printed: string | null | undefined): string {
  if (!printed) return "";
  const key = printed.toLowerCase().replace(/[µμ]/g, "u").replace(/³/g, "3").replace(/\s+/g, "");
  return UNIT_MAP[key] ?? printed.trim();
}

// Multipliers between count units, all relative to "per microliter".
const COUNT_SCALE: Record<string, number> = { "/uL": 1, "10*3/uL": 1e3, "10*5/uL": 1e5, "10*6/uL": 1e6 };

export type Conversion = { toUnit: string; factor: number };

// A conversion from `unit` to the analyte's stored unit, or null when the units already
// match or no safe conversion is known. Only exact, unit-level factors are offered.
export function conversionFor(analyte: Analyte, unit: string): Conversion | null {
  if (!unit || unit === analyte.unit) return null;
  if (unit in COUNT_SCALE && analyte.unit in COUNT_SCALE) {
    return { toUnit: analyte.unit, factor: COUNT_SCALE[unit] / COUNT_SCALE[analyte.unit] };
  }
  if (analyte.molar && analyte.molar.unit === unit) return { toUnit: analyte.unit, factor: analyte.molar.factor };
  if (unit === "g/L" && analyte.unit === "g/dL") return { toUnit: "g/dL", factor: 0.1 };
  if (unit === "m[IU]/mL" && analyte.unit === "m[IU]/L") return null; // usually a typo for µIU/mL; leave to the reviewer
  return null;
}

// Round a converted value to three significant digits (9.8 mmol/L glucose → 177 mg/dL).
export function roundConverted(v: number) {
  if (v === 0) return 0;
  const digits = Math.max(0, 2 - Math.floor(Math.log10(Math.abs(v))));
  return Math.round(v * 10 ** digits) / 10 ** digits;
}
