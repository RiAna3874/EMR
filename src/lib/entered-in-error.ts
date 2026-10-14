// Records marked entered in error stay in the database but drop out of every list,
// count and check made through `db`: reads of these models get `enteredInErrorAt: null`
// unless the query asks about enteredInErrorAt itself. Lookups by id (findUnique) still
// find them. Nested includes aren't filtered; a report's observations are marked with it.
// Duplicate charts merged into another (src/lib/registration/merge.ts) drop out the same way.
const HIDDEN_BY: Record<string, string> = {
  Observation: "enteredInErrorAt",
  DiagnosticReport: "enteredInErrorAt",
  ClinicalDocument: "enteredInErrorAt",
  Patient: "mergedIntoId",
};
const LIST_READS = new Set(["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy"]);

export function withoutEnteredInError(model: string, operation: string, args: unknown) {
  const field = HIDDEN_BY[model];
  if (!field || !LIST_READS.has(operation)) return args;
  const a = (args ?? {}) as { where?: Record<string, unknown> };
  if (a.where && field in a.where) return args;
  return { ...a, where: { ...a.where, [field]: null } };
}
