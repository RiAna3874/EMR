// Which of the patient's problems a typed indication names. An exact name wins;
// otherwise one problem whose name contains the text (or the reverse), so
// "Type 2 diabetes" finds "Type 2 diabetes mellitus without complications".
// Ambiguous or unmatched text links to nothing.
export function matchProblem<P extends { id: string; display: string }>(text: string | null | undefined, problems: P[]): P | null {
  const t = (text ?? "").trim().toLowerCase();
  if (t.length < 3) return null;
  const exact = problems.find((p) => p.display.trim().toLowerCase() === t);
  if (exact) return exact;
  const near = problems.filter((p) => {
    const d = p.display.trim().toLowerCase();
    return d.includes(t) || t.includes(d);
  });
  return near.length === 1 ? near[0] : null;
}
