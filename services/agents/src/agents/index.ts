import type { Agent } from "../framework/agent.js";
import { pricingAgent } from "./pricing.js";
import { agedInventoryAgent } from "./aged-inventory.js";
import { stockingAgent } from "./stocking.js";
import { conquestAgent } from "./conquest.js";
import { leadConversionAgent } from "./lead-conversion.js";
import { photosAgent } from "./photos.js";
import { grossFiAgent } from "./gross-fi.js";
import { gaVdpAgent } from "./ga-vdp.js";

/** All registered agents, keyed by name. */
export const AGENTS: Record<string, Agent> = {
  [stockingAgent.name]: stockingAgent,
  [pricingAgent.name]: pricingAgent,
  [agedInventoryAgent.name]: agedInventoryAgent,
  [leadConversionAgent.name]: leadConversionAgent,
  [conquestAgent.name]: conquestAgent,
  [photosAgent.name]: photosAgent,
  [grossFiAgent.name]: grossFiAgent,
  [gaVdpAgent.name]: gaVdpAgent,
};

export function getAgents(enabled: string[]): Agent[] {
  return enabled.map((name) => AGENTS[name]).filter((a): a is Agent => a !== undefined);
}
