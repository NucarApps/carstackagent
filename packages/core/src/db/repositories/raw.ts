import type { Sql } from "../client.js";

/**
 * Raw-layer writes. Every raw.* table is an append-only daily snapshot keyed by
 * (snapshot_date, location_id, natural_key); we write with ON CONFLICT DO UPDATE
 * so a re-run of the same day is idempotent (Rule 1). Objects passed as values
 * for jsonb columns (e.g. `payload`) are encoded as JSON by postgres.js.
 */

export interface UpsertOptions {
  schema: string;
  table: string;
  /** Uniform row objects (snake_case keys = column names); no `undefined` values. */
  rows: Record<string, unknown>[];
  conflictColumns: string[];
  /** Columns refreshed on conflict (everything except the conflict key). */
  updateColumns: string[];
}

export async function upsertSnapshot(
  sql: Sql,
  opts: UpsertOptions,
): Promise<number> {
  const { schema, table, rows, conflictColumns, updateColumns } = opts;
  if (rows.length === 0) return 0;
  if (updateColumns.length === 0) {
    throw new Error("upsertSnapshot requires at least one updateColumn");
  }
  const columns = Object.keys(rows[0]!);
  const setFragment = updateColumns
    .map((col) => sql`${sql(col)} = excluded.${sql(col)}`)
    .reduce((acc, frag) => sql`${acc}, ${frag}`);

  await sql`
    insert into ${sql(schema)}.${sql(table)} ${sql(rows, ...columns)}
    on conflict (${sql(conflictColumns)}) do update set ${setFragment}
  `;
  return rows.length;
}

export interface IngestionRunSummary {
  status: "succeeded" | "partial" | "failed";
  locationsProcessed: number;
  rowsWritten: number;
  errors: unknown[];
  endpointStats: Record<string, unknown>;
}

export async function openIngestionRun(sql: Sql, runId: string): Promise<void> {
  await sql`
    insert into raw.ingestion_run (run_id, started_at, status)
    values (${runId}, now(), 'running')
  `;
}

export async function closeIngestionRun(
  sql: Sql,
  runId: string,
  summary: IngestionRunSummary,
): Promise<void> {
  await sql`
    update raw.ingestion_run set
      finished_at = now(),
      status = ${summary.status},
      locations_processed = ${summary.locationsProcessed},
      rows_written = ${summary.rowsWritten},
      errors = ${sql.json(summary.errors as never)},
      endpoint_stats = ${sql.json(summary.endpointStats as never)}
    where run_id = ${runId}
  `;
}
