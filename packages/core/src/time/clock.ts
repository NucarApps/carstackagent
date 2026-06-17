/**
 * Injectable clock. The snapshot_date that ingestion stamps on every raw row is
 * derived from here, so a backfill can target a specific date deterministically
 * and tests can assert date-sensitive derivations without real-time flakiness.
 */
export interface Clock {
  /** Current instant. */
  now(): Date;
  /** The logical snapshot date (YYYY-MM-DD) for the current ingestion run. */
  snapshotDate(): string;
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** System clock; optionally pin the snapshot date (e.g. INGESTION_SNAPSHOT_DATE). */
export class SystemClock implements Clock {
  constructor(private readonly pinnedSnapshotDate?: string) {}

  now(): Date {
    return new Date();
  }

  snapshotDate(): string {
    return this.pinnedSnapshotDate ?? toIsoDate(this.now());
  }
}

/** Deterministic clock for tests. */
export class FixedClock implements Clock {
  constructor(private readonly fixed: Date) {}

  now(): Date {
    return new Date(this.fixed.getTime());
  }

  snapshotDate(): string {
    return toIsoDate(this.fixed);
  }
}
