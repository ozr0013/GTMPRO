import { describe, it, expect } from "vitest";
import { buildTinyWorld } from "./fixtures/world";
import { db } from "@/lib/db/client";
import { banditArms, engagements, posts, proposals } from "@/lib/db/schema";
import { dreamCandidates, dreamFor, renderDreamPreview } from "@/lib/learning/dreamer";
import { runHeartbeat } from "@/lib/agents/orchestrator";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

function seedEvidence(worldId: string) {
  // the agent has observed: education/morning arm rewarded, and a morning
  // brewing-science post that drew strong engagement
  const arm = db
    .select()
    .from(banditArms)
    .where(
      and(
        eq(banditArms.worldId, worldId),
        eq(banditArms.archetype, "education"),
        eq(banditArms.timeSlot, "morning"),
      ),
    )
    .get()!;
  db.update(banditArms).set({ alpha: 5, beta: 2 }).where(eq(banditArms.id, arm.id)).run();

  const postId = randomUUID();
  db.insert(posts)
    .values({
      id: postId,
      worldId,
      authorType: "brand",
      archetype: "education",
      topic: "brewing-science",
      caption: "observed post",
      hashtags: [],
      creativeBrief: "b",
      scheduledTick: 8,
      publishedTick: 8, // hour 8 = morning slot
      status: "published",
    })
    .run();
  for (let i = 0; i < 10; i++) {
    db.insert(engagements)
      .values({ id: randomUUID(), worldId, postId, personaId: `p${i}`, kind: "impression", tick: 8 })
      .run();
    if (i < 8) {
      db.insert(engagements)
        .values({ id: randomUUID(), worldId, postId, personaId: `p${i}`, kind: "like", tick: 8 })
        .run();
    }
  }
}

describe("sandbox dreaming (learned model only)", () => {
  it("a fresh world has no dream signal — every candidate sits on the prior", () => {
    const { worldId } = buildTinyWorld("dream-fresh");
    const ranking = dreamCandidates(worldId);

    expect(ranking.candidates).toHaveLength(4 * 3 * 4); // archetypes x slots x topics
    expect(ranking.totalObservations).toBe(0);
    const scores = new Set(ranking.candidates.map((c) => c.score.toFixed(6)));
    expect(scores.size).toBe(1); // uniform prior — no fake winner
    expect(renderDreamPreview(ranking)).toMatch(/no dream signal yet/);
    expect(dreamFor(ranking, "education", "morning", "brewing-science")).toBeNull();
  });

  it("observed evidence ranks the seen combination first — without reading hidden config", () => {
    const { worldId } = buildTinyWorld("dream-evidence");
    seedEvidence(worldId);

    const ranking = dreamCandidates(worldId);
    expect(ranking.totalObservations).toBeGreaterThan(0);

    const top = ranking.candidates[0];
    expect(top.archetype).toBe("education");
    expect(top.timeSlot).toBe("morning");
    expect(top.topic).toBe("brewing-science");
    expect(top.rank).toBe(1);
    expect(top.evidence.arm).toBeGreaterThan(0);
    expect(top.evidence.topic).toBe(10);

    const hit = dreamFor(ranking, "education", "morning", "brewing-science");
    expect(hit).toEqual({ rank: 1, of: 48, score: expect.any(Number) });
    expect(renderDreamPreview(ranking)).toMatch(/#1 education\/morning\/brewing-science/);
  });

  it("heartbeat attaches dream evidence to post proposals once signal exists", async () => {
    const { worldId } = buildTinyWorld("dream-heartbeat");

    // fresh world: proposals carry no dream (honest null, not a fake rank)
    const first = await runHeartbeat(worldId);
    const firstPost = first.proposalIds
      .map((id) => db.select().from(proposals).where(eq(proposals.id, id)).get()!)
      .find((p) => p.kind === "post")!;
    expect((firstPost.evidence as { dream?: unknown }).dream).toBeNull();

    seedEvidence(worldId);
    const second = await runHeartbeat(worldId);
    const secondPost = second.proposalIds
      .map((id) => db.select().from(proposals).where(eq(proposals.id, id)).get()!)
      .find((p) => p.kind === "post")!;
    const dream = (secondPost.evidence as { dream?: { rank: number; of: number } }).dream;
    expect(dream).toBeTruthy();
    expect(dream!.of).toBe(48);
    expect(dream!.rank).toBeGreaterThanOrEqual(1);
  });
});
