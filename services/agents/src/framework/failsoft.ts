import type { Agent } from "./agent.js";

/** True if every ext feed the agent requires is ready (Rule 5). */
export function feedsReady(
  agent: Agent,
  readiness: Record<string, boolean>,
): boolean {
  return agent.requiresExt.every((feed) => readiness[feed] === true);
}
