import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  AnalystOutput,
  CoachOutput,
  CommunityOutput,
  CopywriterOutput,
  CriticOutput,
  PersonaVoiceOutput,
  StrategistOutput,
} from "@/lib/contracts";
import { callAgent, type AgentRole } from "@/lib/agents/models";
import { SYSTEM } from "@/lib/agents/prompts";

// Guards mock/schema drift: every role's mock output must satisfy its contract.
// MODEL_MODE=mock is set by vitest.config.ts, so no network is ever hit.

async function mockCall<T>(role: AgentRole, schema: z.ZodType<T>): Promise<T> {
  const res = await callAgent(role, schema, SYSTEM[role], "Mock-mode contract check", {
    worldSeed: "contracts-seed",
    refId: "test-ref",
  });
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error(res.error);
  // re-parse so schema violations fail loudly here, not downstream
  return schema.parse(res.data);
}

describe("callAgent mock mode returns schema-valid output for every role", () => {
  it("strategist → StrategistOutput", async () => {
    const data = await mockCall("strategist", StrategistOutput);
    expect(data.actions.length).toBeGreaterThanOrEqual(1);
  });

  it("copywriter → CopywriterOutput", async () => {
    const data = await mockCall("copywriter", CopywriterOutput);
    expect(data.caption.length).toBeGreaterThanOrEqual(10);
  });

  it("critic → CriticOutput", async () => {
    const data = await mockCall("critic", CriticOutput);
    expect(["pass", "revise", "block"]).toContain(data.verdict);
  });

  it("analyst → AnalystOutput", async () => {
    const data = await mockCall("analyst", AnalystOutput);
    expect(["exceeded", "met", "missed"]).toContain(data.verdict);
  });

  it("coach → CoachOutput", async () => {
    const data = await mockCall("coach", CoachOutput);
    expect(data.changeSummary.length).toBeGreaterThan(0);
  });

  it("community → CommunityOutput", async () => {
    const data = await mockCall("community", CommunityOutput);
    expect(["continue", "meeting_booked", "disqualified"]).toContain(data.qualification);
  });

  it("persona → PersonaVoiceOutput", async () => {
    const data = await mockCall("persona", PersonaVoiceOutput);
    expect(data.commentText.length).toBeLessThanOrEqual(220);
  });
});
