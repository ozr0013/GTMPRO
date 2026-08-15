import { describe, it, expect } from "vitest";
import { buildTinyWorld } from "./fixtures/world";
import { db } from "@/lib/db/client";
import { proposals, posts, engagements, outcomeReports, playbookVersions, activityLog } from "@/lib/db/schema";
import { runHeartbeat, decideProposal } from "@/lib/agents/orchestrator";
import { getPlaybookHistory } from "@/lib/learning/playbook";
import { advanceTicks } from "@/lib/sim/clock";
import { eq, and, desc } from "drizzle-orm";

describe("walking skeleton: full loop in mock mode", () => {
  it("heartbeat → proposal → approve → publish → outcomes → analyst → coach → new playbook version", async () => {
    const { worldId } = buildTinyWorld("loop-seed");

    // heartbeat at tick 0 (setup call; normally fired by clock at tick 7)
    const { proposalIds } = await runHeartbeat(worldId);
    expect(proposalIds.length).toBeGreaterThanOrEqual(1);
    const pending = db.select().from(proposals).where(eq(proposals.worldId, worldId)).all();
    expect(pending[0].status).toBe("pending"); // propose mode default
    expect(pending[0].reasoning.length).toBeGreaterThan(0);

    // human approves
    await decideProposal(pending[0].id, "approve");
    const published = db.select().from(posts)
      .where(and(eq(posts.worldId, worldId), eq(posts.authorType, "brand"))).all();
    expect(published.length).toBe(1);

    // run two sim days
    await advanceTicks(worldId, 48);

    expect(db.select().from(engagements).where(eq(engagements.worldId, worldId)).all().length).toBeGreaterThan(0);
    expect(db.select().from(outcomeReports).where(eq(outcomeReports.worldId, worldId)).all().length).toBeGreaterThanOrEqual(1);

    const versions = db.select().from(playbookVersions)
      .where(eq(playbookVersions.worldId, worldId)).orderBy(desc(playbookVersions.version)).all();
    expect(versions[0].version).toBeGreaterThanOrEqual(2); // coach created a version

    // activity trail captured the chain
    const log = db.select().from(activityLog).where(eq(activityLog.worldId, worldId)).all();
    for (const actor of ["strategist", "human", "publisher", "analyst", "coach"]) {
      expect(log.some((l) => l.actor === actor), `missing actor ${actor}`).toBe(true);
    }
  });

  it("rejection with reason lands in the coach's next digest", async () => {
    const { worldId } = buildTinyWorld("loop-seed-2");
    const { proposalIds } = await runHeartbeat(worldId);
    await decideProposal(proposalIds[0], "reject", { reason: "Too salesy; we never lead with product pushes." });
    await advanceTicks(worldId, 24);
    const v = db.select().from(playbookVersions).where(eq(playbookVersions.worldId, worldId)).orderBy(desc(playbookVersions.version)).all();
    expect(v[0].version).toBeGreaterThanOrEqual(2); // coach ran on the rejection even with no outcomes
  });

  // The headline claim: learning visibly changes behavior. A typed rejection
  // becomes a playbook rule, and the very next proposal cites that rule by key.
  it("the next proposal cites the rule learned from the previous rejection", async () => {
    const { worldId } = buildTinyWorld("loop-seed-3");
    const hb1 = await runHeartbeat(worldId);
    const first = db.select().from(proposals).where(eq(proposals.id, hb1.proposalIds[0])).get()!;
    const citedBefore = (first.evidence as { ruleIds: string[] }).ruleIds;

    await decideProposal(hb1.proposalIds[0], "reject", {
      reason: "Too salesy; we never lead with product pushes.",
    });
    await advanceTicks(worldId, 24); // day boundary: coach digests the rejection

    const history = getPlaybookHistory(worldId);
    const newest = history[history.length - 1];
    expect(newest.authorType).toBe("coach");
    const added = newest.diff.added;
    expect(added.length).toBeGreaterThan(0);

    // the human's own words became policy
    const rejectionRule = added.find(
      (r) => (r.evidence as { sourceType?: string }).sourceType === "rejection",
    );
    expect(rejectionRule).toBeTruthy();
    expect(rejectionRule!.text).toContain("Too salesy");

    // and the very next proposal cites the new rule by key
    const hb2 = await runHeartbeat(worldId);
    const nextPost = hb2.proposalIds
      .map((id) => db.select().from(proposals).where(eq(proposals.id, id)).get()!)
      .find((p) => p.kind === "post")!;
    expect(nextPost).toBeTruthy();
    const citedAfter = (nextPost.evidence as { ruleIds: string[] }).ruleIds;
    const addedKeys = added.map((r) => r.ruleKey);
    expect(citedAfter.some((k) => addedKeys.includes(k))).toBe(true);
    expect(citedAfter).not.toEqual(citedBefore);
  });
});
