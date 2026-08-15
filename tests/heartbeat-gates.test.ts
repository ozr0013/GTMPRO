import { describe, it, expect, vi, afterEach } from "vitest";
import { CriticOutput } from "@/lib/contracts";

const mocks = vi.hoisted(() => ({
  callAgent: vi.fn(),
}));

vi.mock("@/lib/agents/models", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents/models")>();
  mocks.callAgent.mockImplementation(actual.callAgent);
  return { ...actual, callAgent: mocks.callAgent };
});

import { buildTinyWorld } from "./fixtures/world";
import { db } from "@/lib/db/client";
import { activityLog, proposals } from "@/lib/db/schema";
import { getQuarantined, runHeartbeat } from "@/lib/agents/orchestrator";
import { eq } from "drizzle-orm";

afterEach(() => {
  mocks.callAgent.mockReset();
});

describe("heartbeat gates (mocked callAgent)", () => {
  it("critic block skips without a live proposal", async () => {
    const actual = await vi.importActual<typeof import("@/lib/agents/models")>("@/lib/agents/models");
    mocks.callAgent.mockImplementation(async (role, schema, system, user, opts) => {
      if (role === "critic") {
        return {
          ok: true as const,
          data: CriticOutput.parse({
            verdict: "block",
            issues: [{ severity: "high", kind: "quality", note: "nope" }],
          }),
        };
      }
      return actual.callAgent(role, schema, system, user, opts);
    });

    const { worldId } = buildTinyWorld("hb-critic-block");
    const { proposalIds } = await runHeartbeat(worldId);
    expect(proposalIds).toEqual([]);
    const live = db
      .select()
      .from(proposals)
      .where(eq(proposals.worldId, worldId))
      .all()
      .filter((p) => p.status !== "quarantined");
    expect(live).toHaveLength(0);
    const log = db.select().from(activityLog).where(eq(activityLog.worldId, worldId)).all();
    expect(log.some((l) => l.actor === "critic" && l.status === "blocked")).toBe(true);
  });

  it("strategist failure writes a quarantined proposal and never throws", async () => {
    mocks.callAgent.mockImplementation(async (role, schema, system, user, opts) => {
      if (role === "strategist") return { ok: false as const, error: "structured output failed" };
      const actual = await vi.importActual<typeof import("@/lib/agents/models")>("@/lib/agents/models");
      return actual.callAgent(role, schema, system, user, opts);
    });

    const { worldId } = buildTinyWorld("hb-quarantine");
    await expect(runHeartbeat(worldId)).resolves.toEqual({ proposalIds: [] });
    const q = getQuarantined(worldId);
    expect(q.length).toBeGreaterThanOrEqual(1);
    expect(q[0].status).toBe("quarantined");
  });
});
