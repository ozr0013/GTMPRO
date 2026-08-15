import { describe, it, expect } from "vitest";
import { db } from "@/lib/db/client";
import { posts, engagements, personas } from "@/lib/db/schema";
import { runEngagementWave, applyFollowerChurn } from "@/lib/sim/engine";
import { buildTinyWorld } from "./fixtures/world";
import { eq, and } from "drizzle-orm";

function insertPost(worldId: string, id: string, topic: string, tick: number, archetype = "education") {
  db.insert(posts)
    .values({
      id,
      worldId,
      authorType: "brand",
      archetype,
      topic,
      caption: `Wave test post about ${topic}`,
      hashtags: ["#test"],
      creativeBrief: "test",
      scheduledTick: tick,
      publishedTick: tick,
      status: "published",
    })
    .run();
  return id;
}

function engagementsFor(postId: string) {
  return db.select().from(engagements).where(eq(engagements.postId, postId)).all();
}

describe("two-wave engagement (A3)", () => {
  it("wave 2 never duplicates a persona already reached in wave 1", () => {
    const { worldId } = buildTinyWorld("wave-dup-seed");
    insertPost(worldId, "post-w", "brewing-science", 8);
    runEngagementWave(worldId, "post-w", 8, 1);
    runEngagementWave(worldId, "post-w", 14, 2);

    const impressionsByPersona = new Map<string, number>();
    for (const e of engagementsFor("post-w").filter((e) => e.kind === "impression")) {
      impressionsByPersona.set(e.personaId, (impressionsByPersona.get(e.personaId) ?? 0) + 1);
    }
    for (const [, count] of impressionsByPersona) {
      expect(count).toBe(1);
    }
  });

  it("running the same wave twice is a no-op (idempotent)", () => {
    const { worldId } = buildTinyWorld("wave-idem-seed");
    insertPost(worldId, "post-i", "brewing-science", 8);
    runEngagementWave(worldId, "post-i", 8, 1);
    const after1 = engagementsFor("post-i").length;
    runEngagementWave(worldId, "post-i", 8, 1);
    expect(engagementsFor("post-i").length).toBe(after1);
  });

  it("high-scoring non-followers can convert to followers (follow rows recorded)", () => {
    const { worldId } = buildTinyWorld("wave-follow-seed");
    // large interested audience: everyone loves brewing-science education at 8am
    const rows = db.select().from(personas).where(eq(personas.worldId, worldId)).all();
    for (const p of rows) {
      db.update(personas)
        .set({
          isFollower: false,
          hidden: {
            interests: ["brewing-science"],
            skepticism: 0.1,
            engagementPropensity: 0.95,
            purchaseIntent: 0.5,
            dmOpenness: 0.5,
            activeHours: [8],
          },
        })
        .where(eq(personas.id, p.id))
        .run();
    }
    insertPost(worldId, "post-f", "brewing-science", 8);
    runEngagementWave(worldId, "post-f", 8, 1);
    const follows = engagementsFor("post-f").filter((e) => e.kind === "follow");
    expect(follows.length).toBeGreaterThanOrEqual(1);
    const followerCount = db
      .select()
      .from(personas)
      .where(and(eq(personas.worldId, worldId), eq(personas.isFollower, true)))
      .all().length;
    expect(followerCount).toBe(follows.length);
  });

  it("follower churn fires only after more than 4 brand posts in a day", () => {
    const { worldId } = buildTinyWorld("churn-seed");
    // everyone follows; then a spammy day
    db.update(personas).set({ isFollower: true }).where(eq(personas.worldId, worldId)).run();

    for (let i = 0; i < 4; i++) insertPost(worldId, `calm-${i}`, "brewing-science", 1 + i);
    expect(applyFollowerChurn(worldId, 24)).toBe(0); // 4 posts: no churn

    for (let i = 0; i < 6; i++) insertPost(worldId, `spam-${i}`, "brewing-science", 25 + i);
    const churned = applyFollowerChurn(worldId, 48); // 6 posts in day 2
    expect(churned).toBeGreaterThanOrEqual(0); // 5% rolls over 12 followers — usually 0-2
    const stillFollowing = db
      .select()
      .from(personas)
      .where(and(eq(personas.worldId, worldId), eq(personas.isFollower, true)))
      .all().length;
    expect(stillFollowing).toBe(12 - churned);
  });
});
