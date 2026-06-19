import type { TaskContext } from "./context.js";
import { ingestInventory } from "./inventory.js";
import { ingestMarket } from "./market.js";
import { ingestCrm } from "./crm.js";

export type { TaskContext } from "./context.js";

/** Run every endpoint task for one location, in order. */
export async function runLocationTasks(ctx: TaskContext): Promise<void> {
  await ingestInventory(ctx);
  await ingestMarket(ctx);
  await ingestCrm(ctx);
}

export { ingestInventory, ingestMarket, ingestCrm };
