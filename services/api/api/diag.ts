// Zero-dependency diagnostic endpoint. Imports NOTHING but node types, so it
// cannot fail from app config, the DB, or workspace bundling. Hit /api/diag:
//   - returns JSON  -> the Vercel function runtime itself is healthy; any crash
//     in the main API is specific to its imports/config (see env_present below).
//   - crashes too   -> the failure is platform-level (Node/ESM, bundling, or a
//     plan limit like maxDuration), not our application code.
// Reports only presence (true/false) of env vars — never their values.
import type { IncomingMessage, ServerResponse } from "node:http";

const CHECK = [
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
  "DATABASE_URL",
  "SUPABASE_DB_URL",
  "SUPABASE_JWT_SECRET",
  "SUPABASE_URL",
  "CORS_ORIGIN",
  "CRON_SECRET",
  "ANTHROPIC_API_KEY",
  "CARSTACK_API_KEY",
] as const;

export default function handler(_req: IncomingMessage, res: ServerResponse): void {
  const envPresent: Record<string, boolean> = {};
  for (const key of CHECK) {
    const v = process.env[key];
    envPresent[key] = Boolean(v && v.trim() !== "");
  }
  res.statusCode = 200;
  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify(
      {
        ok: true,
        node: process.version,
        region: process.env["VERCEL_REGION"] ?? null,
        env_present: envPresent,
      },
      null,
      2,
    ),
  );
}
