import postgres from "postgres";
import { loadDatabaseUrl } from "../config/env.js";

/**
 * postgres.js client. We never set a search_path — every query uses
 * schema-qualified names (raw.*, core.*, rec.*, ref.*, ext.*) so behavior does
 * not depend on connection state.
 */
export type Sql = ReturnType<typeof postgres>;

export interface DbOptions {
  /** Max pool connections. Cron workers stay small; the api can go higher. */
  max?: number;
  /** Override the connection string (tests point at an ephemeral database). */
  connectionString?: string;
}

let singleton: Sql | undefined;

export function createSql(options: DbOptions = {}): Sql {
  const url = options.connectionString ?? loadDatabaseUrl();
  return postgres(url, {
    max: options.max ?? 5,
    // Quiet NOTICE noise (e.g. "schema already exists") in migrations.
    onnotice: () => {},
    types: {
      // Return numeric/decimal as JS numbers (dollar impacts, prices).
      // postgres.js returns numerics as strings by default; we coerce on read
      // in repositories where precision matters, so leave the default parser.
    },
  });
}

/** Process-wide singleton for long-lived services (the api). */
export function getSql(options: DbOptions = {}): Sql {
  if (!singleton) {
    singleton = createSql(options);
  }
  return singleton;
}

export async function closeSql(): Promise<void> {
  if (singleton) {
    await singleton.end({ timeout: 5 });
    singleton = undefined;
  }
}

/** Run `fn` inside a transaction. */
export async function withTransaction<T>(
  sql: Sql,
  fn: (tx: Sql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => fn(tx as unknown as Sql)) as Promise<T>;
}
