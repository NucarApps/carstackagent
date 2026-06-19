import { runOrchestrator } from "./run.js";

/** Railway cron entrypoint: refresh the worklist, then exit. */
runOrchestrator()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("orchestrator crashed:", err);
    process.exit(1);
  });

export { runOrchestrator } from "./run.js";
