/** Accumulates per-endpoint stats and errors for the raw.ingestion_run audit. */
export interface EndpointStat {
  rows: number;
  calls: number;
  forbidden: number;
  errors: number;
}

export class RunReport {
  private readonly stats = new Map<string, EndpointStat>();
  readonly errors: Array<{ endpoint: string; locationId: string; message: string }> = [];
  rowsWritten = 0;

  private bucket(endpoint: string): EndpointStat {
    let s = this.stats.get(endpoint);
    if (!s) {
      s = { rows: 0, calls: 0, forbidden: 0, errors: 0 };
      this.stats.set(endpoint, s);
    }
    return s;
  }

  call(endpoint: string): void {
    this.bucket(endpoint).calls += 1;
  }

  rows(endpoint: string, n: number): void {
    this.bucket(endpoint).rows += n;
    this.rowsWritten += n;
  }

  forbidden(endpoint: string): void {
    this.bucket(endpoint).forbidden += 1;
  }

  error(endpoint: string, locationId: string, message: string): void {
    this.bucket(endpoint).errors += 1;
    this.errors.push({ endpoint, locationId, message });
  }

  endpointStats(): Record<string, EndpointStat> {
    return Object.fromEntries(this.stats.entries());
  }

  status(): "succeeded" | "partial" | "failed" {
    if (this.errors.length === 0) return "succeeded";
    return this.rowsWritten > 0 ? "partial" : "failed";
  }
}
