import { describe, it, expect } from "vitest";
import { buildTinyWorld } from "./fixtures/world";
import { db } from "@/lib/db/client";
import { proposals, settings } from "@/lib/db/schema";
import { decideProposal, runHeartbeat } from "@/lib/agents/orchestrator";
import { advanceTicks } from "@/lib/sim/clock";
import {
  getActivePlaybook,
  getActivity,
  getFeed,
  getPendingProposals,
  getWorld,
} from "@/lib/db/queries";
import { eq } from "drizzle-orm";

// Mock mode is the default, so this whole file runs offline with zero network calls.

describe("mock-mode walking skeleton", () => {
  it("runs heartbeat -> approval -> publish -> engagement -> learning", async () => {
    const { worldId } = buildTinyWorld("loop-seed");

    const { proposalIds } = await runHeartbeat(worldId);
    expect(proposalIds.length).toBeGreaterThan(0);

    const pending = getPendingProposals(worldId);
    expect(pending).toHaveLength(proposalIds.length);
    // the proposal has to justify itself: reasoning + cited rules + honest ranges
    expect(pending[0].reasoning.length).toBeGreaterThan(0);
    expect(pending[0].ruleIds.length).toBeGreaterThan(0);
    expect(pending[0].predictedEffect.impressions[1]).toBeGreaterThan(0);

    decideProposal(pending[0].id, "approve");
    expect(getPendingProposals(worldId)).toHaveLength(0);

    // a full sim day: publishes the post, runs engagement + funnel, then the
    // day boundary evaluates the outcome and the coach writes a new version
    await advanceTicks(worldId, 48);

    const feed = getFeed(worldId);
    expect(feed.length).toBeGreaterThan(0);
    expect(feed[0].metrics.impressions).toBeGreaterThan(0);

    const world = getWorld(worldId)!;
    expect(world.simTick).toBe(48);
    expect(world.playbookVersion).toBeGreaterThan(1);

    const playbook = getActivePlaybook(worldId);
    expect(playbook.rules.length).toBeGreaterThan(3); // v1 seeds + at least one learned rule

    const actors = new Set(getActivity(worldId, 500).map((row) => row.actor));
    expect(actors).toContain("strategist");
    expect(actors).toContain("critic");
    expect(actors).toContain("human");
    expect(actors).toContain("publisher");
    expect(actors).toContain("analyst");
    expect(actors).toContain("coach");
  });

  it("is deterministic: identical seeds produce identical engagement", async () => {
    const runOnce = async (seed: string) => {
      const { worldId } = buildTinyWorld(seed);
      const { proposalIds } = await runHeartbeat(worldId);
      decideProposal(proposalIds[0], "approve");
      await advanceTicks(worldId, 30);
      const feed = getFeed(worldId);
      return feed.map((p) => `${p.archetype}:${p.metrics.impressions}:${p.metrics.likes}`);
    };

    expect(await runOnce("determinism-seed")).toEqual(await runOnce("determinism-seed"));
  });

  it("a paused world refuses to act", async () => {
    const { worldId } = buildTinyWorld("paused-seed");
    db.update(settings).set({ paused: true }).where(eq(settings.worldId, worldId)).run();

    const { proposalIds } = await runHeartbeat(worldId);
    expect(proposalIds).toHaveLength(0);
    expect(db.select().from(proposals).where(eq(proposals.worldId, worldId)).all()).toHaveLength(0);

    const blocked = getActivity(worldId, 10).find((row) => row.status === "blocked");
    expect(blocked?.summary).toMatch(/paused/i);
  });

  it("a rejection with a reason reaches the coach", async () => {
    const { worldId } = buildTinyWorld("reject-seed");
    const { proposalIds } = await runHeartbeat(worldId);
    decideProposal(proposalIds[0], "reject", "too salesy for this audience");

    await advanceTicks(worldId, 24);

    const rejected = db.select().from(proposals).where(eq(proposals.id, proposalIds[0])).get()!;
    expect(rejected.status).toBe("rejected");
    expect(rejected.humanReason).toBe("too salesy for this audience");

    // nothing was published, but the human signal still produced a playbook version
    expect(getFeed(worldId)).toHaveLength(0);
    expect(getWorld(worldId)!.playbookVersion).toBeGreaterThan(1);
  });
});
