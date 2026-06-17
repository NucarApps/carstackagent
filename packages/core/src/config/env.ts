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

const databaseSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
});

export function loadDatabaseUrl(): string {
  return parse(databaseSchema, "database").DATABASE_URL;
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
