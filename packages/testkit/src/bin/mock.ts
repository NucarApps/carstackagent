import { startMockServer } from "../mock-server.js";

/** Standalone mock CarStack server (used by docker-compose and local dev). */
const port = Number(process.env.PORT ?? 8787);
const forbidden = (process.env.MOCK_FORBIDDEN ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const apiKey = process.env.MOCK_API_KEY || undefined;

startMockServer(port, { forbidden, apiKey });
// eslint-disable-next-line no-console
console.log(
  `mock CarStack listening on :${port}` +
    (forbidden.length ? ` (forbidden: ${forbidden.join(", ")})` : ""),
);
