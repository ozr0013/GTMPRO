// Funnel simulation: profile visits roll into link clicks, signups and
// persona-initiated DMs against each persona's hidden purchase intent.

import { db } from "@/lib/db/client";
import { worlds, personas, posts, engagements, funnelEvents, dmThreads, dmMessages } from "@/lib/db/schema";
import type { PersonaHidden } from "@/lib/types";
import { subRng } from "@/lib/rng";
import { callAgent } from "@/lib/agents/models";
import { SYSTEM } from "@/lib/agents/prompts";
import { PersonaVoiceOutput } from "@/lib/contracts";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

export async function runFunnel(worldId: string, tick: number): Promise<void> {
  const world = db.select().from(worlds).where(eq(worlds.id, worldId)).get()!;
  const visits = db
    .select()
    .from(engagements)
    .where(
      and(
        eq(engagements.worldId, worldId),
        eq(engagements.kind, "profile_visit"),
        eq(engagements.tick, tick),
      ),
    )
    .all();

  for (const visit of visits) {
    const persona = db.select().from(personas).where(eq(personas.id, visit.personaId)).get()!;
    const hidden = persona.hidden as PersonaHidden;
    const rng = subRng(world.seed, "funnel", persona.handle, tick);

    // Tuning (2026-08-15): the original constants multiplied purchase intent at
    // every stage (click 0.6·PI, then signup 0.3·PI), compounding to ~3.6% signup
    // per profile visit — with the engine emitting ~5-15 visits/day, a whole demo
    // arc rounded to ZERO signups and meetings (observed on two live runs; the
    // headline bounty metric read zero). A profile visit already expresses intent,
    // so downstream stages use intent as a differentiator, not a squared gate:
    // high-intent personas stay ~2-3x likelier than low-intent at every stage,
    // and a 3-day arc now lands a handful of signups and ~1 booked meeting.
    if (rng() >= 0.35 + 0.5 * hidden.purchaseIntent) continue; // no link click, funnel ends here
    db.insert(funnelEvents)
      .values({
        id: randomUUID(),
        worldId,
        personaId: persona.id,
        kind: "link_click",
        sourcePostId: visit.postId,
        tick,
      })
      .run();

    if (rng() < 0.15 + 0.45 * hidden.purchaseIntent) {
      db.insert(funnelEvents)
        .values({
          id: randomUUID(),
          worldId,
          personaId: persona.id,
          kind: "signup",
          sourcePostId: visit.postId,
          tick,
        })
        .run();
    }

    if (rng() < 0.25 * hidden.dmOpenness + 0.35 * hidden.purchaseIntent) {
      const openThread = db
        .select()
        .from(dmThreads)
        .where(
          and(
            eq(dmThreads.worldId, worldId),
            eq(dmThreads.personaId, persona.id),
            eq(dmThreads.status, "open"),
          ),
        )
        .get();
      if (openThread) continue;

      const post = db.select().from(posts).where(eq(posts.id, visit.postId)).get()!;
      const threadId = randomUUID();
      db.insert(dmThreads)
        .values({ id: threadId, worldId, personaId: persona.id, status: "open", turnCount: 0, createdTick: tick })
        .run();

      const opener = await callAgent(
        "persona",
        PersonaVoiceOutput,
        SYSTEM.persona,
        `Persona bio: ${persona.bio}\nSegment: ${persona.segment}\nYou just visited the brand's profile after seeing this post: "${post.caption}"\nWrite the short DM you send to the brand.`,
        { worldSeed: world.seed, refId: `dm-open-${persona.handle}-${tick}` },
      );
      db.insert(dmMessages)
        .values({
          id: randomUUID(),
          threadId,
          sender: "persona",
          text: opener.ok ? opener.data.commentText : "Hey, curious about this.",
          tick,
        })
        .run();
      db.insert(funnelEvents)
        .values({
          id: randomUUID(),
          worldId,
          personaId: persona.id,
          kind: "dm_started",
          sourcePostId: visit.postId,
          tick,
        })
        .run();
    }
  }
}
