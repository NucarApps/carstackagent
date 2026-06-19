import { defineAgent } from "eve";

/**
 * Pricing decision agent on Vercel Eve (reference for the other 7 agents).
 *
 * The deterministic guarantees live in the TOOLS (they run the existing trigger
 * SQL and set the dollar impact from the SQL-computed value); the model only
 * narrates and selects. Model id uses the AI-SDK provider form; set
 * ANTHROPIC_API_KEY (or a Vercel AI Gateway key) in the Eve project env.
 *
 * NOTE: Eve is beta (launched 2026-06-17). Verify defineAgent/defineTool/
 * defineSchedule signatures against the current docs (https://vercel.com/docs/eve);
 * the reuse pattern below is the important, stable part.
 */
export default defineAgent({
  model: "anthropic/claude-opus-4-8",
});
