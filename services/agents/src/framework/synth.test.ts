import { describe, expect, it } from "vitest";
import { reconcileImpact, synthesize } from "./synth.js";
import type { Agent, AgentRow } from "./agent.js";

const row: AgentRow = {
  subjectId: "VIN1",
  subjectLabel: "Toyota RAV4 2022 (VIN1)",
  evidence: { days_on_lot: 70, other_number: 500 },
  baseImpact: 1000,
};

describe("reconcileImpact (LLM never does arithmetic)", () => {
  it("accepts a model impact that matches the SQL baseline", () => {
    const r = reconcileImpact(1000, 0.8, row);
    expect(r.expectedDollarImpact).toBe(1000);
    expect(r.confidence).toBeCloseTo(0.8);
  });

  it("accepts a model impact that matches a supplied evidence value", () => {
    const r = reconcileImpact(500, 0.9, row);
    expect(r.expectedDollarImpact).toBe(500);
  });

  it("overrides a fabricated number with the SQL value and caps confidence", () => {
    const r = reconcileImpact(7777, 0.95, row);
    expect(r.expectedDollarImpact).toBe(1000); // SQL wins
    expect(r.confidence).toBeLessThanOrEqual(0.5);
  });
});

const fakeAgent: Agent = {
  name: "fake",
  recType: "pricing_markdown",
  ownerRole: "used_car_mgr",
  subjectType: "vin",
  requiresExt: [],
  defaultParams: {},
  trigger: () => Promise.resolve([]),
  systemInstructions: () => "test",
  fallbackText: () => ({ issue: "i", action: "a", rationale: "r" }),
};

describe("synthesize without an LLM", () => {
  it("falls back deterministically and covers every row", async () => {
    const out = await synthesize(null, fakeAgent, [row], []);
    const s = out.get("VIN1");
    expect(s).toBeDefined();
    expect(s?.expectedDollarImpact).toBe(1000); // baseImpact
    expect(s?.issue).toBe("i");
  });
});
