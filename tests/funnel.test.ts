import { describe, it, expect } from "vitest";
import { buildTinyWorld } from "./fixtures/world";
import { db } from "@/lib/db/client";
import { engagements, funnelEvents, personas, posts } from "@/lib/db/schema";
import { runFunnel } from "@/lib/sim/funnel";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";

function seedPost(worldId: string): string {
  const id = randomUUID();
  db.insert(posts)
    .values({
      id,
      worldId,
      authorType: "brand",
      archetype: "education",
      topic: "brewing-science",
      caption: "How water temperature changes extraction",
      hashtags: ["#coffee"],
      creativeBrief: "diagram",
      scheduledTick: 8,
      publishedTick: 8,
      status: "published",
    })
    .run();
  return id;
}

/**
 * The funnel must actually convert at demo scale — the original constants
 * compounded purchase intent at every stage and a whole demo arc produced ZERO
 * signups and meetings (the headline bounty metric). This pins the yield: with
 * every fixture persona visiting once, a realistic share clicks through, and at
 * least one signup and one DM thread appear.
 */
describe("funnel conversion (A: sim tuning)", () => {
  it("profile visits convert to clicks, signups and DM threads at demo scale", async () => {
    const { worldId } = buildTinyWorld("funnel-tuning");
    const postId = seedPost(worldId);
    const people = db.select().from(personas).where(eq(personas.worldId, worldId)).all();
    expect(people).toHaveLength(12);

    for (const persona of people) {
      db.insert(engagements)
        .values({
          id: randomUUID(),
          worldId,
          postId,
          personaId: persona.id,
          kind: "profile_visit",
          tick: 8,
        })
        .run();
    }

    await runFunnel(worldId, 8);

    const events = db.select().from(funnelEvents).where(eq(funnelEvents.worldId, worldId)).all();
    const clicks = events.filter((e) => e.kind === "link_click");
    const signups = events.filter((e) => e.kind === "signup");
    const dms = events.filter((e) => e.kind === "dm_started");

    // 12 visitors, click probability 0.42-0.62 across fixture intents
    expect(clicks.length).toBeGreaterThanOrEqual(4);
    expect(clicks.length).toBeLessThanOrEqual(12);
    // signups must be reachable in a single visit wave (DMs are rarer — asserted
    // over repeated waves in the next test)
    expect(signups.length).toBeGreaterThanOrEqual(1);

    // structural: downstream events only for personas who clicked
    const clickers = new Set(clicks.map((c) => c.personaId));
    for (const event of [...signups, ...dms]) {
      expect(clickers.has(event.personaId)).toBe(true);
    }

    // every stage traces back to the source post (meeting attribution depends on it)
    for (const event of events) {
      expect(event.sourcePostId).toBe(postId);
    }
  });

  it("purchase intent still differentiates: high-intent segment out-clicks low-intent over repeated waves", async () => {
    const { worldId } = buildTinyWorld("funnel-intent");
    const postId = seedPost(worldId);
    const people = db.select().from(personas).where(eq(personas.worldId, worldId)).all();

    // five visit waves at different ticks → 20 draws per segment (4 personas each)
    for (const tick of [8, 9, 10, 11, 12]) {
      for (const persona of people) {
        db.insert(engagements)
          .values({ id: randomUUID(), worldId, postId, personaId: persona.id, kind: "profile_visit", tick })
          .run();
      }
      await runFunnel(worldId, tick);
    }

    const clicksBySegment = (segment: string) => {
      const ids = new Set(people.filter((p) => p.segment === segment).map((p) => p.id));
      return db
        .select()
        .from(funnelEvents)
        .where(and(eq(funnelEvents.worldId, worldId), eq(funnelEvents.kind, "link_click")))
        .all()
        .filter((e) => ids.has(e.personaId)).length;
    };

    // fixture purchase intent: cafe-owners 0.55 vs coffee-nerds 0.25
    expect(clicksBySegment("cafe-owners")).toBeGreaterThan(clicksBySegment("coffee-nerds"));

    // over 60 visits the DM path must fire — meetings depend on threads existing
    const dms = db
      .select()
      .from(funnelEvents)
      .where(and(eq(funnelEvents.worldId, worldId), eq(funnelEvents.kind, "dm_started")))
      .all();
    expect(dms.length).toBeGreaterThanOrEqual(1);
  });
});
