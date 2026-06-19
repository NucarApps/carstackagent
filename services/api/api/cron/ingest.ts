// Vercel Cron entry for ingestion. Compiled by Vercel (outside src/). Ingest one
// rooftop per invocation (?location=<id>) to stay under the function duration
// cap; with no param it ingests all active locations sequentially. For many
// rooftops or long throttle windows, move ingestion to an Eve durable workflow
// (see VERCEL.md). Protected by CRON_SECRET when set (Vercel Cron sends it as a
// Bearer token).
import type { IncomingMessage, ServerResponse } from "node:http";

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const secret = process.env["CRON_SECRET"];
  if (secret && req.headers["authorization"] !== `Bearer ${secret}`) {
    res.statusCode = 401;
    res.end("unauthorized");
    return;
  }

  const url = new URL(req.url ?? "/", "http://localhost");
  const location = url.searchParams.get("location") ?? undefined;

  try {
    // Dynamic import so a bundling/resolution failure surfaces as a readable
    // JSON 500 rather than crashing module load (FUNCTION_INVOCATION_FAILED).
    const { runIngestion } = await import("@dip/ingestion/run");
    const result = await runIngestion(location ? { locationIds: [location] } : {});
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error("ingestion cron failed:", err);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  }
}
