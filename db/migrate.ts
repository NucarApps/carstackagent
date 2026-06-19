import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createSql, loadMigrationDatabaseUrl } from "@dip/core";

/**
 * Ordered migration runner. Applies the spine schema then the agents/learning
 * migration, tracking applied files in public._dip_migrations so re-runs skip
 * (pass --force to re-apply; the SQL is idempotent regardless).
 */
const here = dirname(fileURLToPath(import.meta.url));

const MIGRATIONS = [
  "dealership_spine_schema.sql",
  "migration_002_agents_and_learning.sql",
] as const;

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  // --skip-if-no-db lets a CI/Vercel build succeed when no DB URL is configured
  // yet (e.g. before the Supabase integration is added); migrations then run on
  // the next deploy once the URL is injected.
  const skipIfNoDb = process.argv.includes("--skip-if-no-db");

  let connectionString: string;
  try {
    connectionString = loadMigrationDatabaseUrl(); // DDL prefers a direct (non-pooled) URL
  } catch (err) {
    if (skipIfNoDb) {
      console.warn(
        "⚠ Skipping migrations — no database URL is configured.\n" +
          (err instanceof Error ? err.message : String(err)) +
          "\nThe build will continue; migrations will run on the next deploy once a DB URL is set.",
      );
      return;
    }
    throw err;
  }

  const sql = createSql({ max: 1, connectionString });
  try {
    // On Supabase, PostGIS is installed in the `extensions` schema; include it
    // on the path so geometry types/functions resolve while the geo views are
    // created. Harmless locally (a non-existent schema is ignored).
    await sql.unsafe(`set search_path to public, extensions`);
    await sql.unsafe(`
      create table if not exists public._dip_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )
    `);
    const appliedRows = await sql<{ name: string }[]>`
      select name from public._dip_migrations
    `;
    const applied = new Set(appliedRows.map((r) => r.name));

    for (const file of MIGRATIONS) {
      if (applied.has(file) && !force) {
        console.log(`• skip   ${file} (already applied)`);
        continue;
      }
      console.log(`• apply  ${file} ...`);
      const content = readFileSync(join(here, file), "utf8");
      await sql.unsafe(content).simple();
      await sql`
        insert into public._dip_migrations (name) values (${file})
        on conflict (name) do update set applied_at = now()
      `;
      console.log(`  done   ${file}`);
    }
    console.log("Migrations complete.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
