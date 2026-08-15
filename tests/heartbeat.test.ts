import { describe, it, expect } from "vitest";
import { buildTinyWorld } from "./fixtures/world";
import { db } from "@/lib/db/client";
import { activityLog, posts, proposals, settings } from "@/lib/db/schema";
import { decideProposal, getQuarantined, runHeartbeat } from "@/lib/agents/orchestrator";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

describe("heartbeat + approval", () => {
  it("creates a pending proposal with reasoning in propose mode", async () => {
    const { worldId } = buildTinyWorld("hb-seed");
    const { proposalIds } = await runHeartbeat(worldId);
    expect(proposalIds.length).toBeGreaterThanOrEqual(1);
    const pending = db.select().from(proposals).where(eq(proposals.worldId, worldId)).all();
    expect(pending[0].status).toBe("pending");
    expect(pending[0].reasoning.length).toBeGreaterThan(0);
  });

  it("approve inserts a brand post; reject stores reason and does not post", async () => {
    const { worldId } = buildTinyWorld("hb-approve");
    const { proposalIds } = await runHeartbeat(worldId);
    await decideProposal(proposalIds[0], "approve");
    const brand = db
      .select()
      .from(posts)
      .where(eq(posts.worldId, worldId))
      .all()
      .filter((p) => p.authorType === "brand");
    expect(brand.length).toBe(1);
    expect(brand[0].proposalId).toBe(proposalIds[0]);

    const { worldId: w2 } = buildTinyWorld("hb-reject");
    const second = await runHeartbeat(w2);
    await decideProposal(second.proposalIds[0], "reject", { reason: "Too salesy" });
    const rejected = db.select().from(proposals).where(eq(proposals.id, second.proposalIds[0])).get()!;
    expect(rejected.status).toBe("rejected");
    expect(rejected.humanReason).toBe("Too salesy");
    expect(db.select().from(posts).where(eq(posts.worldId, w2)).all()).toHaveLength(0);
  });

  it("paused heartbeat is a no-op", async () => {
    const { worldId } = buildTinyWorld("hb-pause");
    db.update(settings).set({ paused: true }).where(eq(settings.worldId, worldId)).run();
    const { proposalIds } = await runHeartbeat(worldId);
    expect(proposalIds).toEqual([]);
    expect(db.select().from(proposals).where(eq(proposals.worldId, worldId)).all()).toHaveLength(0);
    const log = db.select().from(activityLog).where(eq(activityLog.worldId, worldId)).all();
    expect(log.some((l) => l.summary.includes("paused"))).toBe(true);
  });

  it("guardrail cap skip leaves no live proposal", async () => {
    const { worldId } = buildTinyWorld("hb-cap");
    for (let i = 0; i < 3; i++) {
      db.insert(posts)
        .values({
          id: randomUUID(),
          worldId,
          authorType: "brand",
          archetype: "meme",
          topic: "t",
          caption: "c",
          hashtags: [],
          creativeBrief: "b",
          scheduledTick: 8,
          publishedTick: 8,
          status: "published",
        })
        .run();
    }
    const { proposalIds } = await runHeartbeat(worldId);
    expect(proposalIds).toEqual([]);
    const live = db
      .select()
      .from(proposals)
      .where(eq(proposals.worldId, worldId))
      .all()
      .filter((p) => p.status === "pending" || p.status === "auto_approved" || p.status === "executed");
    expect(live).toHaveLength(0);
    const log = db.select().from(activityLog).where(eq(activityLog.worldId, worldId)).all();
    expect(log.some((l) => l.status === "blocked")).toBe(true);
  });
});

describe("quarantine", () => {
  it("getQuarantined returns empty when the loop is healthy", async () => {
    const { worldId } = buildTinyWorld("hb-q");
    await runHeartbeat(worldId);
    expect(getQuarantined(worldId)).toHaveLength(0);
  });
});
