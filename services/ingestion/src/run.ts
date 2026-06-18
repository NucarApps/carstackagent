import { randomUUID } from "node:crypto";
import {
  CarstackClient,
  SystemClock,
  childLogger,
  coreRepo,
  createSql,
  loadCarstackConfig,
  rawRepo,
  refRepo,
  type Clock,
  type Sql,
} from "@dip/core";
import { RunReport } from "./run-report.js";
import { runLocationTasks } from "./tasks/index.js";

export interface RunIngestionOptions {
  sql?: Sql;
  client?: CarstackClient;
  clock?: Clock;
  runId?: string;
  /** Restrict to these location ids (default: all active). */
  locationIds?: string[];
}

export interface RunIngestionResult {
  runId: string;
  status: "succeeded" | "partial" | "failed";
  rowsWritten: number;
  locationsProcessed: number;
  endpointStats: Record<string, unknown>;
  customersResolved: number;
}

/**
 * One nightly ingestion pass: per-location loop pulling CarStack into raw.*,
 * then a customer-resolution pass. Per-location failures are caught so one bad
 * store does not abort the run. Returns the run summary (also persisted to
 * raw.ingestion_run).
 */
export async function runIngestion(
  opts: RunIngestionOptions = {},
): Promise<RunIngestionResult> {
  const runId = opts.runId ?? randomUUID();
  const logger = childLogger({ svc: "ingestion", runId });
  const sql = opts.sql ?? createSql({ max: 5 });
  const ownSql = !opts.sql;
  const clock = opts.clock ?? new SystemClock(process.env.INGESTION_SNAPSHOT_DATE);
  const snapshotDate = clock.snapshotDate();

  const client =
    opts.client ??
    (() => {
      const cfg = loadCarstackConfig();
      return new CarstackClient({
        base: cfg.CARSTACK_API_BASE,
        apiKey: cfg.CARSTACK_API_KEY,
        pageSizeMax: cfg.PAGE_SIZE_MAX,
        vdpRatePerMin: cfg.VDP_RATE_PER_MIN,
      });
    })();

  const report = new RunReport();
  let locationsProcessed = 0;
  let customersResolved = 0;

  try {
    await rawRepo.openIngestionRun(sql, runId);

    const allLocations = await refRepo.getActiveLocations(sql);
    const locations = opts.locationIds
      ? allLocations.filter((l) => opts.locationIds!.includes(l.locationId))
      : allLocations;

    for (const loc of locations) {
      logger.info({ locationId: loc.locationId }, "ingesting location");
      try {
        await runLocationTasks({
          sql,
          client,
          report,
          logger,
          meta: { snapshotDate, locationId: loc.locationId, sourceRunId: runId },
        });
        locationsProcessed += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        report.error("location", loc.locationId, message);
        logger.error({ locationId: loc.locationId, err: message }, "location failed");
      }
    }

    // Rebuild customer entities from the latest snapshots (Rule 4).
    try {
      customersResolved = await coreRepo.resolveCustomers(sql);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      report.error("resolve_customers", "*", message);
      logger.error({ err: message }, "customer resolution failed");
    }

    const status = report.status();
    await rawRepo.closeIngestionRun(sql, runId, {
      status,
      locationsProcessed,
      rowsWritten: report.rowsWritten,
      errors: report.errors,
      endpointStats: report.endpointStats(),
    });

    logger.info(
      { status, rowsWritten: report.rowsWritten, locationsProcessed, customersResolved },
      "ingestion complete",
    );
    return {
      runId,
      status,
      rowsWritten: report.rowsWritten,
      locationsProcessed,
      endpointStats: report.endpointStats(),
      customersResolved,
    };
  } finally {
    if (ownSql) await sql.end({ timeout: 5 });
  }
}
