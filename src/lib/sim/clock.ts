// Request-driven sim clock: advancing N ticks runs publishing, engagement,
// funnel, persona voices, community, and the day-boundary analyst/coach loop.

import { db } from "@/lib/db/client";
import { worlds, posts, engagements, personas } from "@/lib/db/schema";
import { runEngagementWave } from "@/lib/sim/engine";
import { runFunnel } from "@/lib/sim/funnel";
import { runHeartbeat, logActivity } from "@/lib/agents/orchestrator";
import { runCommunity } from "@/lib/agents/communityRunner";
import { runAnalyst } from "@/lib/agents/analystRunner";
import { runCoach } from "@/lib/agents/coachRunner";
import { callAgent } from "@/lib/agents/models";
import { SYSTEM } from "@/lib/agents/prompts";
import { PersonaVoiceOutput } from "@/lib/contracts";
import { and, eq } from "drizzle-orm";

export async function advanceTicks(worldId: string, n: number): Promise<{ tick: number }> {
  const world = db.select().from(worlds).where(eq(worlds.id, worldId)).get()!;
  const start = world.simTick;

  for (let t = start + 1; t <= start + n; t++) {
    db.update(worlds).set({ simTick: t }).where(eq(worlds.id, worldId)).run();

    // (a) publish due scheduled posts
    const due = db
      .select()
      .from(posts)
      .where(and(eq(posts.worldId, worldId), eq(posts.status, "scheduled")))
      .all()
      .filter((p) => p.scheduledTick <= t);
    for (const post of due) {
      db.update(posts).set({ status: "published", publishedTick: t }).where(eq(posts.id, post.id)).run();
      logActivity(worldId, t, "publisher", "publish_post", "published", `published: ${post.caption.slice(0, 80)}`, {
        refType: "post",
        refId: post.id,
      });
      // Track A note: the plan describes two engagement waves (publish + publish+6h
      // with early-velocity boost), but runEngagementWave is NOT idempotent per
      // (post, persona) — a second call would duplicate impression/like rows.
      // Deliberate deviation: run the wave EXACTLY ONCE per post, at publish time.
      // Second-wave/velocity dynamics arrive with Task A3's engine changes.
      runEngagementWave(worldId, post.id, t);
    }

    // (b) funnel rolls for this tick's profile visits
    await runFunnel(worldId, t);

    // (c) fill pending persona comment voices
    const pendingVoices = db
      .select()
      .from(engagements)
      .where(and(eq(engagements.worldId, worldId), eq(engagements.commentText, "[pending persona voice]")))
      .all();
    for (const engagement of pendingVoices) {
      const persona = db.select().from(personas).where(eq(personas.id, engagement.personaId)).get()!;
      const post = db.select().from(posts).where(eq(posts.id, engagement.postId)).get()!;
      const voice = await callAgent(
        "persona",
        PersonaVoiceOutput,
        SYSTEM.persona,
        `Persona bio: ${persona.bio}\nSegment: ${persona.segment}\nPost caption: ${post.caption}\nWrite one short in-character comment on this post.`,
        { worldSeed: world.seed, refId: engagement.id },
      );
      db.update(engagements)
        .set({ commentText: voice.ok ? voice.data.commentText : "Nice post!" })
        .where(eq(engagements.id, engagement.id))
        .run();
    }

    // (d) community answers open DM threads
    await runCommunity(worldId, t);

    // (e) day boundary: analyst closes outcome windows, then coach learns
    if (t % 24 === 0) {
      await runAnalyst(worldId, t);
      await runCoach(worldId, t);
    }

    // (f) morning heartbeat
    if (t % 24 === 7) {
      await runHeartbeat(worldId);
    }
  }

  return { tick: start + n };
}
