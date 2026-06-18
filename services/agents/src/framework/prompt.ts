import type { recRepo } from "@dip/core";
import type { Agent } from "./agent.js";

type KnowledgeRow = Awaited<ReturnType<typeof recRepo.getKnowledge>>[number];

/**
 * Base synthesis system prompt. It pins the model to the supplied numbers (no
 * arithmetic), asks for one recommendation per input row, and injects retrieved
 * dealer-specific knowledge (the RAG side of the learning loop).
 */
export function buildSystemPrompt(agent: Agent, knowledge: KnowledgeRow[]): string {
  const kb = knowledge.length
    ? "\n\nDealer-specific knowledge to weigh before recommending:\n" +
      knowledge.map((k) => `- ${k.title}: ${k.body}`).join("\n")
    : "";

  return [
    `You are the "${agent.name}" decision agent for a multi-rooftop auto dealership group.`,
    `Deterministic SQL has already flagged a small set of subjects and computed every number for each one (provided in its "evidence", including an "expected_dollar_impact").`,
    ``,
    `Rules you MUST follow:`,
    `- Do NOT compute, sum, average, or otherwise derive any number. Use ONLY the numbers in each row's evidence.`,
    `- For expected_dollar_impact, return EXACTLY the precomputed "expected_dollar_impact" value from that row's evidence.`,
    `- In evidence_keys_used, list the evidence keys you actually relied on.`,
    `- Write a concise "issue" (what is wrong / the opportunity), a concrete "action" (the single next step the owner should take), and a short "rationale" grounded only in the provided numbers.`,
    `- "confidence" is your 0..1 judgement that the action is worth doing now.`,
    `- Return exactly one recommendation object per input row, echoing its subject_id.`,
    ``,
    agent.systemInstructions(),
    kb,
  ].join("\n");
}
