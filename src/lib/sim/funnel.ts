import { db } from "@/lib/db/client";
import { dmThreads, engagements, funnelEvents, personas, posts, worlds } from "@/lib/db/schema";
import type { PersonaHidden } from "@/lib/types";
import { subRng } from "@/lib/rng";
import { postStreamKey } from "./streams";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

/**
 * Post-engagement funnel: follow, link_click, signup, dm_started.
 *
 * Each stage only sees personas that cleared the previous one, so the shape is a
 * real funnel rather than four independent coin flips. Every draw comes from a
 * stream keyed on stable identifiers (world seed, post id, persona handle) —
 * never row UUIDs — so identical seeds yield identical funnels.
 */
export function runFunnelWave(worldId: string, postId: string, tick: number): void {
  const world = db.select().from(worlds).where(eq(worlds.id, worldId)).get()!;
  const post = db.select().from(posts).where(eq(posts.id, postId)).get()!;

  const engaged = db
    .select()
    .from(engagements)
    .where(and(eq(engagements.worldId, worldId), eq(engagements.postId, postId)))
    .all();

  // deepest engagement kind per persona gates how far down the funnel they can go
  const byPersona = new Map<string, Set<string>>();
  for (const e of engaged) {
    if (!byPersona.has(e.personaId)) byPersona.set(e.personaId, new Set());
    byPersona.get(e.personaId)!.add(e.kind);
  }

  const record = (personaId: string, kind: string) =>
    db
      .insert(funnelEvents)
      .values({ id: randomUUID(), worldId, personaId, kind, sourcePostId: postId, tick })
      .run();

  for (const [personaId, kinds] of byPersona) {
    const persona = db.select().from(personas).where(eq(personas.id, personaId)).get();
    if (!persona) continue;
    const hidden = persona.hidden as PersonaHidden;
    const rng = subRng(world.seed, "funnel", postStreamKey(post), persona.handle);

    // draw the whole ladder up front so a persona's stream length never depends
    // on where they dropped out — keeps runs reproducible as thresholds change
    const draw = { follow: rng(), click: rng(), signup: rng(), dm: rng() };

    // follow: liked the post and isn't already a follower
    if (!persona.isFollower && kinds.has("like") && draw.follow < hidden.engagementPropensity) {
      db.insert(engagements)
        .values({ id: randomUUID(), worldId, postId, personaId, kind: "follow", tick })
        .run();
      db.update(personas).set({ isFollower: true }).where(eq(personas.id, personaId)).run();
    }

    // link_click: liking is the entry gate; skepticism damps intent
    if (!kinds.has("like")) continue;
    const clickP = hidden.purchaseIntent * (1 - hidden.skepticism * 0.5);
    if (draw.click >= clickP) continue;
    record(personaId, "link_click");

    // signup: product posts convert harder than the rest
    const signupP = hidden.purchaseIntent * (post.archetype === "product" ? 0.8 : 0.5);
    if (draw.signup >= signupP) continue;
    record(personaId, "signup");

    // dm_started: only signups open a thread, and only once per persona
    if (draw.dm >= hidden.dmOpenness) continue;
    const existing = db
      .select()
      .from(dmThreads)
      .where(and(eq(dmThreads.worldId, worldId), eq(dmThreads.personaId, personaId)))
      .get();
    if (existing) continue;
    record(personaId, "dm_started");
    db.insert(dmThreads)
      .values({ id: randomUUID(), worldId, personaId, status: "open", createdTick: tick })
      .run();
  }
}
