import { runAgents } from "./run.js";

/** Railway cron entrypoint: run all enabled agents, then exit. */
runAgents()
  .then((result) => {
    const failed = result.results.some((r) => !r.skipped && r.recommendationsWritten < 0);
    process.exit(failed ? 1 : 0);
  })
  .catch((err) => {
    console.error("agents run crashed:", err);
    process.exit(1);
  });

export { runAgents } from "./run.js";
