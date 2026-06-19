import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadDatabaseUrl, loadMigrationDatabaseUrl } from "./env.js";

const DB_VARS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "SUPABASE_DB_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "MIGRATION_DATABASE_URL",
];

describe("database URL resolution (provider-agnostic)", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const v of DB_VARS) {
      saved[v] = process.env[v];
      delete process.env[v];
    }
  });
  afterEach(() => {
    for (const v of DB_VARS) {
      if (saved[v] === undefined) delete process.env[v];
      else process.env[v] = saved[v];
    }
  });

  it("prefers DATABASE_URL when present", () => {
    process.env["DATABASE_URL"] = "postgres://a";
    process.env["POSTGRES_URL"] = "postgres://b";
    expect(loadDatabaseUrl()).toBe("postgres://a");
  });

  it("falls back to POSTGRES_URL (Vercel/Supabase integration) when DATABASE_URL is unset", () => {
    process.env["POSTGRES_URL"] = "postgres://vercel";
    expect(loadDatabaseUrl()).toBe("postgres://vercel");
  });

  it("falls back to SUPABASE_DB_URL", () => {
    process.env["SUPABASE_DB_URL"] = "postgres://supabase";
    expect(loadDatabaseUrl()).toBe("postgres://supabase");
  });

  it("throws an actionable error when no DB url var is set", () => {
    expect(() => loadDatabaseUrl()).toThrow(/No database connection string is set/);
  });

  it("migrations prefer the non-pooling URL over the pooled one", () => {
    process.env["POSTGRES_URL"] = "postgres://pooled";
    process.env["POSTGRES_URL_NON_POOLING"] = "postgres://direct";
    expect(loadMigrationDatabaseUrl()).toBe("postgres://direct");
  });
});
