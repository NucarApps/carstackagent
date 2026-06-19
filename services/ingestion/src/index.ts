import { runIngestion } from "./run.js";

/** Railway cron entrypoint: run one pass, then exit (non-zero only on failure). */
runIngestion()
  .then((result) => {
    process.exit(result.status === "failed" ? 1 : 0);
  })
  .catch((err) => {
    console.error("ingestion crashed:", err);
    process.exit(1);
  });

export { runIngestion } from "./run.js";
