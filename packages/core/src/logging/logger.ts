import pino, { type Logger } from "pino";

/**
 * Structured logging via pino. Services create one root logger and derive
 * child loggers with correlation ids (a run_id for cron jobs, a request id for
 * the api) so every line for a given run/request can be grouped.
 */

let rootLogger: Logger | undefined;

export function getLogger(): Logger {
  if (!rootLogger) {
    rootLogger = pino({
      level: process.env.LOG_LEVEL ?? "info",
      base: { service: process.env.DIP_SERVICE_NAME ?? undefined },
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  }
  return rootLogger;
}

export function childLogger(bindings: Record<string, unknown>): Logger {
  return getLogger().child(bindings);
}

export type { Logger };
