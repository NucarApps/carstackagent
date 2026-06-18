import {
  CarstackClient,
  ScopeNotEnabledError,
  type AdapterMeta,
  type Logger,
  type Sql,
} from "@dip/core";
import type { RunReport } from "../run-report.js";

export interface TaskContext {
  sql: Sql;
  client: CarstackClient;
  meta: AdapterMeta; // snapshotDate, locationId, sourceRunId for this location
  report: RunReport;
  logger: Logger;
}

/**
 * Record an endpoint error. A 403 (scope not enabled) is non-fatal (Rule 2) —
 * it is tallied and the caller skips that endpoint for the rest of the run.
 * Returns true if it was a scope-not-enabled 403.
 */
export function recordEndpointError(
  ctx: TaskContext,
  endpoint: string,
  err: unknown,
): boolean {
  if (err instanceof ScopeNotEnabledError) {
    ctx.report.forbidden(endpoint);
    ctx.logger.warn({ endpoint, locationId: ctx.meta.locationId }, "scope not enabled (403) — skipping");
    return true;
  }
  const message = err instanceof Error ? err.message : String(err);
  ctx.report.error(endpoint, ctx.meta.locationId, message);
  ctx.logger.error({ endpoint, locationId: ctx.meta.locationId, err: message }, "endpoint failed");
  return false;
}
