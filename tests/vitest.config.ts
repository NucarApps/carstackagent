import { defineConfig } from "vitest/config";

// DB integration tests share one Postgres database, so run them serially in a
// single worker to avoid cross-file truncation races.
export default defineConfig({
  test: {
    fileParallelism: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
