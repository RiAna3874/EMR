// Records marked entered in error stay in the database but drop out of every list,
// count and check made through `db`: reads of these models get `enteredInErrorAt: null`
// unless the query asks about enteredInErrorAt itself. Lookups by id (findUnique) still
// find them. Nested includes aren't filtered; a report's observations are marked with it.
const HIDES_ENTERED_IN_ERROR = new Set(["Observation", "DiagnosticReport", "ClinicalDocument"]);
const LIST_READS = new Set(["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy"]);

export function withoutEnteredInError(model: string, operation: string, args: unknown) {
  if (!HIDES_ENTERED_IN_ERROR.has(model) || !LIST_READS.has(operation)) return args;
  const a = (args ?? {}) as { where?: Record<string, unknown> };
  if (a.where && "enteredInErrorAt" in a.where) return args;
  return { ...a, where: { ...a.where, enteredInErrorAt: null } };
}
