import { z } from "zod";

/**
 * Environment configuration, validated with Zod and loaded lazily per concern.
 *
 * Each service validates only the slice it needs (the api should not fail to
 * boot because CARSTACK_API_KEY is unset, etc.). Loaders throw a readable error
 * listing the missing/invalid variables so misconfiguration fails fast at boot.
 */

function parse<T extends z.ZodTypeAny>(schema: T, label: string): z.infer<T> {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid ${label} environment configuration:\n${issues}`);
  }
  return result.data;
}

const commonSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

export type CommonConfig = z.infer<typeof commonSchema>;

export function loadCommonConfig(): CommonConfig {
  return parse(commonSchema, "common");
}

/**
 * Database connection string. Read from whatever env var the host/provider
 * injects, in priority order, so the app works unchanged on Railway, Vercel
 * (the Supabase/Postgres Marketplace integrations inject POSTGRES_URL* /
 * SUPABASE_DB_URL — not DATABASE_URL), or a plain Postgres. Returns null if none
 * are set.
 *
 * Pooled vs direct: serverless/runtime callers use the pooled URL; migrations
 * (DDL) prefer the non-pooling/direct URL — see loadMigrationDatabaseUrl.
 */
const DB_URL_VARS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "SUPABASE_DB_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
] as const;

const MIGRATION_DB_URL_VARS = [
  // DDL should not run through the transaction pooler; prefer a direct URL.
  "MIGRATION_DATABASE_URL",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL",
  "SUPABASE_DB_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
] as const;

function firstEnv(names: readonly string[]): string | null {
  for (const name of names) {
    const v = process.env[name];
    if (v && v.trim() !== "") return v;
  }
  return null;
}

function missingDbUrlError(): Error {
  return new Error(
    [
      "No database connection string is set.",
      "Set one of: " + DB_URL_VARS.join(", ") + ".",
      "On Vercel, add the Supabase (or Postgres) Marketplace integration — it",
      "injects POSTGRES_URL automatically into all environments. On Railway,",
      "set DATABASE_URL on the service (variables are per-service). See VERCEL.md.",
    ].join("\n"),
  );
}

export function loadDatabaseUrl(): string {
  const url = firstEnv(DB_URL_VARS);
  if (!url) throw missingDbUrlError();
  return url;
}

/** Connection string for migrations — prefers a direct (non-pooled) URL. */
export function loadMigrationDatabaseUrl(): string {
  const url = firstEnv(MIGRATION_DB_URL_VARS);
  if (!url) throw missingDbUrlError();
  return url;
}

const carstackSchema = z.object({
  CARSTACK_API_BASE: z.string().url().default("https://carstack.io/api/v1/t/Nucar"),
  CARSTACK_API_KEY: z.string().min(1, "CARSTACK_API_KEY is required"),
  VDP_RATE_PER_MIN: z.coerce.number().int().positive().default(240),
  PAGE_SIZE_MAX: z.coerce.number().int().positive().max(200).default(200),
  INGESTION_SNAPSHOT_DATE: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
    .optional(),
});

export type CarstackConfig = z.infer<typeof carstackSchema>;

export function loadCarstackConfig(): CarstackConfig {
  return parse(carstackSchema, "carstack");
}

const anthropicSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  ANTHROPIC_MODEL: z.string().default("claude-opus-4-8"),
  AGENT_MAX_TOKENS: z.coerce.number().int().positive().default(16000),
  AGENTS_ENABLED: z
    .string()
    .default("stocking,pricing,aged-inventory,lead-conversion,conquest"),
  CALIBRATION_LEARN_RATE: z.coerce.number().min(0).max(1).default(0.25),
});

export type AnthropicConfig = z.infer<typeof anthropicSchema>;

export function loadAnthropicConfig(): AnthropicConfig {
  return parse(anthropicSchema, "anthropic");
}

export function parseEnabledAgents(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const orchestratorSchema = z.object({
  WORKLIST_EXPIRY_DAYS: z.coerce.number().int().positive().default(14),
  MIN_DOLLAR_IMPACT: z.coerce.number().min(0).default(250),
});

export type OrchestratorConfig = z.infer<typeof orchestratorSchema>;

export function loadOrchestratorConfig(): OrchestratorConfig {
  return parse(orchestratorSchema, "orchestrator");
}

const apiSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  SUPABASE_JWT_SECRET: z.string().min(1, "SUPABASE_JWT_SECRET is required"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
});

export type ApiConfig = z.infer<typeof apiSchema>;

export function loadApiConfig(): ApiConfig {
  return parse(apiSchema, "api");
}
