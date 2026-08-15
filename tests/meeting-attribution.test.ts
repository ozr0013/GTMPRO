// Regression guard for the headline metric. meeting_booked rows are written by the
// publisher when a DM thread qualifies, and carry no sourcePostId — so a purely
// post-attributed roll-up reported "Meetings 0" while threads were qualifying.

import { describe, it, expect } from "vitest";
import { buildTinyWorld } from "./fixtures/world";
import { db } from "@/lib/db/client";
import { funnelEvents, personas, posts } from "@/lib/db/schema";
import { postMetrics } from "@/lib/sim/metrics";
import { getFunnelSummary } from "@/lib/db/queries";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

function publishedPost(worldId: string) {
  const id = randomUUID();
  db.insert(posts)
    .values({
      id,
      worldId,
      authorType: "brand",
      archetype: "education",
      topic: "t",
      caption: "c",
      hashtags: [],
      creativeBrief: "b",
      scheduledTick: 7,
      publishedTick: 7,
      status: "published",
    })
    .run();
  return id;
}

function funnel(worldId: string, personaId: string, kind: string, sourcePostId: string | null) {
  db.insert(funnelEvents)
    .values({ id: randomUUID(), worldId, personaId, kind, sourcePostId, tick: 12 })
    .run();
}

describe("meetings are attributed through the DM thread that produced them", () => {
  it("counts a meeting against the post that opened the conversation", () => {
    const { worldId } = buildTinyWorld("meet-attr");
    const postId = publishedPost(worldId);
    const persona = db.select().from(personas).where(eq(personas.worldId, worldId)).all()[0];

    funnel(worldId, persona.id, "dm_started", postId);
    // the publisher has no post in hand when a thread qualifies
    funnel(worldId, persona.id, "meeting_booked", null);

    expect(postMetrics(worldId, postId).meetings).toBe(1);
    expect(getFunnelSummary(worldId).find((s) => s.stage === "Meetings")?.count).toBe(1);
  });

  it("does not credit a post that never opened that persona's thread", () => {
    const { worldId } = buildTinyWorld("meet-attr-2");
    const opener = publishedPost(worldId);
    const bystander = publishedPost(worldId);
    const persona = db.select().from(personas).where(eq(personas.worldId, worldId)).all()[0];

    funnel(worldId, persona.id, "dm_started", opener);
    funnel(worldId, persona.id, "meeting_booked", null);

    expect(postMetrics(worldId, opener).meetings).toBe(1);
    expect(postMetrics(worldId, bystander).meetings).toBe(0);
  });

  it("still counts meetings that already carry a source post", () => {
    const { worldId } = buildTinyWorld("meet-attr-3");
    const postId = publishedPost(worldId);
    const persona = db.select().from(personas).where(eq(personas.worldId, worldId)).all()[0];

    funnel(worldId, persona.id, "meeting_booked", postId);
    expect(postMetrics(worldId, postId).meetings).toBe(1);
  });

  it("does not double-count a meeting with both a source post and a thread", () => {
    const { worldId } = buildTinyWorld("meet-attr-4");
    const postId = publishedPost(worldId);
    const persona = db.select().from(personas).where(eq(personas.worldId, worldId)).all()[0];

    funnel(worldId, persona.id, "dm_started", postId);
    funnel(worldId, persona.id, "meeting_booked", postId);

    expect(postMetrics(worldId, postId).meetings).toBe(1);
  });
});
