import type { SubjectType } from "@dip/core";

/**
 * The dedupe_key for a recommendation. The partial unique index on
 * rec.recommendation enforces one OPEN recommendation per key, so this must be
 * stable for "the same issue about the same subject".
 */
export function buildDedupeKey(
  recType: string,
  locationId: string,
  subjectType: SubjectType,
  subjectId: string,
): string {
  return `${recType}:${locationId}:${subjectType}:${subjectId}`;
}
