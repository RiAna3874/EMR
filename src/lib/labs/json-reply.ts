// Reading Claude's JSON answer when it isn't constrained by structured outputs.
// Large schemas (an outside document's sections, measurements, diagnoses, medications,
// follow-ups, each with where it sits on the page) are too big for the API to compile
// into a grammar, so the schema goes in the prompt and the answer is checked here.
import { z } from "zod";

type JsonSchema = { type?: string | string[]; properties?: Record<string, JsonSchema>; items?: JsonSchema; anyOf?: JsonSchema[] };

export const jsonSchemaOf = (schema: z.ZodType) => z.toJSONSchema(schema) as JsonSchema;

export function schemaInstructions(schema: z.ZodType): string {
  return `Reply with only one JSON object, no other text, that matches this JSON Schema. Include every property; use null where the schema allows it and nothing is printed, and [] for an empty list.\n\n${JSON.stringify(jsonSchemaOf(schema))}`;
}

const allows = (s: JsonSchema, t: string): boolean =>
  (Array.isArray(s.type) ? s.type.includes(t) : s.type === t) || !!s.anyOf?.some((x) => allows(x, t));

// Fills properties the model left out: null where null is allowed, [] for lists.
function fillMissing(value: unknown, s: JsonSchema): unknown {
  if (Array.isArray(value)) return s.items ? value.map((v) => fillMissing(v, s.items!)) : value;
  if (!value || typeof value !== "object" || !s.properties) return value;
  const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const [k, sub] of Object.entries(s.properties)) {
    if (out[k] === undefined) {
      if (allows(sub, "null")) out[k] = null;
      else if (allows(sub, "array")) out[k] = [];
    } else {
      out[k] = fillMissing(out[k], sub);
    }
  }
  return out;
}

export type JsonReply<T> = { ok: true; data: T } | { ok: false; error: string };

export function parseJsonReply<S extends z.ZodType>(text: string, schema: S): JsonReply<z.infer<S>> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return { ok: false, error: "The answer had no JSON object." };
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    return { ok: false, error: `The JSON didn't parse: ${e instanceof Error ? e.message : e}` };
  }
  const parsed = schema.safeParse(fillMissing(raw, jsonSchemaOf(schema)));
  if (parsed.success) return { ok: true, data: parsed.data };
  const issues = parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
  return { ok: false, error: `The JSON didn't match the schema: ${issues.join("; ")}` };
}
