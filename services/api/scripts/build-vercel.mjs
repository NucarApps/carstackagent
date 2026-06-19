// Emits a Vercel Build Output API directory (services/api/.vercel/output) so
// Vercel serves finished functions instead of compiling our raw api/*.ts in the
// monorepo/ESM context (which crashed every function with
// FUNCTION_INVOCATION_FAILED — see VERCEL.md).
//
// Each function is esbuild-bundled into ONE self-contained CommonJS file with all
// workspace + npm deps inlined (no pnpm-symlink file tracing) and a
// {"type":"commonjs"} marker so it loads unambiguously under the repo's ESM root.
// Run AFTER `tsc -b` has produced dist/ (the bundler reads the compiled output).
import { build } from "esbuild";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(here, ".."); // services/api
const outRoot = join(apiRoot, ".vercel", "output");
const fnRoot = join(outRoot, "functions");
const staticRoot = join(outRoot, "static");

// name -> compiled entry. The name is the function's route target in config.json.
const FUNCTIONS = [
  { name: "api-main", entry: join(apiRoot, "dist", "serverless", "api.js") },
  { name: "cron-ingest", entry: join(apiRoot, "dist", "serverless", "cron-ingest.js") },
];

const VC_CONFIG = {
  runtime: "nodejs22.x",
  handler: "index.js",
  launcherType: "Nodejs",
  maxDuration: 300,
  shouldAddHelpers: false, // we read the raw req stream; helpers would consume it
};

async function main() {
  for (const fn of FUNCTIONS) {
    if (!existsSync(fn.entry)) {
      throw new Error(
        `Missing compiled entry ${fn.entry}. Run \`pnpm --filter @dip/api build\` (tsc -b) first.`,
      );
    }
  }

  rmSync(outRoot, { recursive: true, force: true });

  for (const fn of FUNCTIONS) {
    const dir = join(fnRoot, `${fn.name}.func`);
    mkdirSync(dir, { recursive: true });
    await build({
      entryPoints: [fn.entry],
      outfile: join(dir, "index.js"),
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node22",
      sourcemap: "inline",
      logLevel: "info",
      // Make the default export the module.exports itself, so Vercel's Node
      // launcher gets the handler whether it reads `module.exports` or
      // `module.exports.default`.
      footer: { js: "if (module.exports && module.exports.default) module.exports = module.exports.default;" },
    });
    writeFileSync(join(dir, ".vc-config.json"), JSON.stringify(VC_CONFIG, null, 2));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "commonjs" }, null, 2));
  }

  // Static build canary, served by Vercel directly (no function). If this loads
  // at /_build.txt, the Build Output deployment is live and current; the embedded
  // commit tells us EXACTLY which build is serving (distinguishes a stale/failed
  // build from a function runtime crash).
  const sha = process.env["VERCEL_GIT_COMMIT_SHA"] ?? "local";
  mkdirSync(staticRoot, { recursive: true });
  writeFileSync(
    join(staticRoot, "_build.txt"),
    `commit=${sha}\nbuilt=${new Date().toISOString()}\nbuild-output-api=true\n`,
  );

  // Routes: cron path -> cron function; serve static files (the canary) via the
  // filesystem handler; everything else -> the API function. With the Build
  // Output API, `dest` only selects the function — it still receives the ORIGINAL
  // request path, so Fastify's unprefixed routes match.
  const config = {
    version: 3,
    routes: [
      { src: "/api/cron/ingest", dest: "/cron-ingest" },
      { handle: "filesystem" },
      { src: "/(.*)", dest: "/api-main" },
    ],
  };
  mkdirSync(outRoot, { recursive: true });
  writeFileSync(join(outRoot, "config.json"), JSON.stringify(config, null, 2));

  console.log(`Build Output API written to ${outRoot} (commit=${sha})`);
  for (const fn of FUNCTIONS) console.log(`  • functions/${fn.name}.func`);
  console.log("  • static/_build.txt (canary)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
