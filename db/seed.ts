import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createSql } from "@dip/core";

/**
 * Applies reference + demo seeds in dependency order. Reference seeds
 * (roles/locations/makes/types/feed-status/calibration) are always safe; the
 * demo Polk seed is for local/dev only (skipped with --no-demo).
 */
const here = dirname(fileURLToPath(import.meta.url));

const REFERENCE_SEEDS = [
  "ref_roles.sql",
  "ref_locations.sql",
  "ref_makes_models.sql",
  "ref_recommendation_types.sql",
  "ext_feed_status.sql",
  "calibration_defaults.sql",
] as const;

const DEMO_SEEDS = ["demo_owned_polk.sql"] as const;

async function main(): Promise<void> {
  const includeDemo = !process.argv.includes("--no-demo");
  const files = [...REFERENCE_SEEDS, ...(includeDemo ? DEMO_SEEDS : [])];
  const sql = createSql({ max: 1 });
  try {
    for (const file of files) {
      console.log(`• seed   ${file} ...`);
      const content = readFileSync(join(here, "seeds", file), "utf8");
      await sql.unsafe(content).simple();
    }
    console.log("Seeds complete.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
