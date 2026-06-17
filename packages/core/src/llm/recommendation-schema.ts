import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * Structured output contract for agent synthesis. The model receives a
 * pre-aggregated, SQL-flagged slice and returns one entry per subject. It does
 * NOT compute anything: `expected_dollar_impact` must be one of the precomputed
 * numbers supplied in the slice (referenced via `evidence_keys_used`), and the
 * agents framework post-validates this — on mismatch the SQL value wins.
 *
 * Objects are `.strict()` so the emitted JSON Schema sets additionalProperties
 * false (required by Anthropic structured outputs). Numeric range checks live in
 * TypeScript post-validation, not the JSON Schema (range constraints are not
 * supported by structured outputs).
 */
export const synthItemSchema = z
  .object({
    subject_id: z.string(),
    issue: z.string(),
    action: z.string(),
    rationale: z.string(),
    expected_dollar_impact: z.number(),
    confidence: z.number(),
    evidence_keys_used: z.array(z.string()),
  })
  .strict();

export const synthResultSchema = z
  .object({
    recommendations: z.array(synthItemSchema),
  })
  .strict();

export type SynthItem = z.infer<typeof synthItemSchema>;
export type SynthResult = z.infer<typeof synthResultSchema>;

/** JSON Schema for Anthropic `output_config.format`. */
export function synthJsonSchema(): Record<string, unknown> {
  const schema = zodToJsonSchema(synthResultSchema, {
    target: "jsonSchema7",
    $refStrategy: "none",
  }) as Record<string, unknown>;
  delete schema["$schema"];
  return schema;
}
