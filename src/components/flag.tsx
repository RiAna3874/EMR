import type { Flag } from "@prisma/client";

const styles: Record<Flag, string> = {
  N: "",
  L: "text-low",
  H: "text-high",
  LL: "text-crit font-bold",
  HH: "text-crit font-bold",
  A: "text-high",
};

const badgeStyles: Record<Flag, string> = {
  N: "",
  L: "bg-low-soft text-low",
  H: "bg-high-soft text-high",
  LL: "bg-crit text-white",
  HH: "bg-crit text-white",
  A: "bg-high-soft text-high",
};

export const flagText = (f: Flag | null | undefined) => (f ? styles[f] : "");

export function FlagBadge({ flag }: { flag: Flag | null | undefined }) {
  if (!flag || flag === "N") return null;
  const label = flag === "LL" ? "L!!" : flag === "HH" ? "H!!" : flag;
  return (
    <span className={`ml-1 inline-block rounded px-1 text-[10px] font-bold leading-4 ${badgeStyles[flag]}`} title={flagTitle(flag)}>
      {label}
    </span>
  );
}

export function flagTitle(f: Flag) {
  return { N: "Normal", L: "Low", H: "High", LL: "Critical low", HH: "Critical high", A: "Abnormal" }[f];
}
