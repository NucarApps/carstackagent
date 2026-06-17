import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createSql } from "@dip/core";

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
  const sql = createSql({ max: 1 });
  try {
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
