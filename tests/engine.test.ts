import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db/client";
import { posts, engagements, personas } from "@/lib/db/schema";
import { buildTinyWorld } from "./fixtures/world";
import { runEngagementWave } from "@/lib/sim/engine";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

// Fixed post ids (not randomUUID): the engine keys its rng streams on
// (world.seed, postId, persona.handle), so same-seed determinism requires
// stable post ids across runs.
function insertPost(worldId: string, id: string, topic: string, tick = 8) {
  db.insert(posts)
    .values({
      id,
      worldId,
      authorType: "brand",
      archetype: "education",
      topic,
      caption: "How water temp changes extraction",
      hashtags: ["#coffee"],
      creativeBrief: "diagram",
      scheduledTick: tick,
      publishedTick: tick,
      status: "published",
    })
    .run();
  return id;
}

describe("engagement engine", () => {
  let worldId: string;
  beforeEach(() => {
    worldId = buildTinyWorld(`seed-${randomUUID()}`).worldId;
  });

  it("is deterministic for the same world seed", () => {
    const w1 = buildTinyWorld("fixed").worldId;
    const w2 = buildTinyWorld("fixed").worldId;
    // persona ids are random UUIDs, so compare by handle. Both runs must share
    // one post id (it seeds the rng); posts.id is a PK, so drop the row between runs.
    const run = (wid: string) => {
      const pid = insertPost(wid, "post-determinism", "brewing-science");
      runEngagementWave(wid, pid, 8);
      db.delete(posts).where(eq(posts.id, pid)).run();
      return db
        .select({ kind: engagements.kind, personaId: engagements.personaId })
        .from(engagements)
        .where(eq(engagements.worldId, wid))
        .all()
        .map(
          (e) =>
            `${db.select().from(personas).where(eq(personas.id, e.personaId)).get()!.handle}:${e.kind}`,
        )
        .sort();
    };
    expect(run(w1)).toEqual(run(w2));
  });

  it("gives interest-matching posts more engagement than mismatched ones", () => {
    const match = insertPost(worldId, "post-match", "brewing-science");
    const miss = insertPost(worldId, "post-miss", "unrelated-topic");
    runEngagementWave(worldId, match, 8);
    runEngagementWave(worldId, miss, 8);
    const count = (pid: string) =>
      db
        .select()
        .from(engagements)
        .where(eq(engagements.postId, pid))
        .all()
        .filter((e) => e.kind !== "impression").length;
    expect(count(match)).toBeGreaterThan(count(miss));
  });

  it("discovery floor: a 0-follower world still yields >= 10 impressions", () => {
    db.update(personas).set({ isFollower: false }).where(eq(personas.worldId, worldId)).run();
    const pid = insertPost(worldId, "post-floor", "brewing-science");
    runEngagementWave(worldId, pid, 8);
    const impressions = db
      .select()
      .from(engagements)
      .where(eq(engagements.postId, pid))
      .all()
      .filter((e) => e.kind === "impression").length;
    expect(impressions).toBeGreaterThanOrEqual(10);
  });
});
