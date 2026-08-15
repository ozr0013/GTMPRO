// Request-driven sim clock: advancing N ticks runs publishing, engagement,
// funnel, persona voices, community, and the day-boundary analyst/coach loop.

import { db } from "@/lib/db/client";
import { worlds, posts, engagements, personas } from "@/lib/db/schema";
import { runEngagementWave, applyFollowerChurn } from "@/lib/sim/engine";
import { generateAmbientPosts } from "@/lib/sim/ambient";
import { runFunnel } from "@/lib/sim/funnel";
import { runPersonaDmReplies } from "@/lib/sim/dm";
import { runHeartbeat, expireStaleProposals } from "@/lib/agents/orchestrator";
import { logActivity } from "@/lib/agents/log";
import { runCommunityPass } from "@/lib/agents/communityRunner";
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

    // (a0) ambient/competitor accounts post on their own schedules (feed noise;
    // no engagement waves — worlds without config.ambient produce none)
    generateAmbientPosts(worldId, t);

    // (a) publish due scheduled posts
    const due = db
      .select()
      .from(posts)
      .where(and(eq(posts.worldId, worldId), eq(posts.status, "scheduled")))
      .all()
      .filter((p) => p.scheduledTick <= t);
    for (const post of due) {
      db.update(posts).set({ status: "published", publishedTick: t }).where(eq(posts.id, post.id)).run();
      logActivity({
        worldId,
        tick: t,
        actor: "publisher",
        action: "publish_post",
        status: "published",
        summary: `published: ${post.caption.slice(0, 80)}`,
        refType: "post",
        refId: post.id,
      });
      runEngagementWave(worldId, post.id, t, 1);
    }

    // (a2) second engagement wave 6h after publish — idempotent per (post, persona);
    // sample size scales with wave-1 velocity (hidden early-velocity dynamic, Task A3)
    const secondWaveDue = db
      .select()
      .from(posts)
      .where(and(eq(posts.worldId, worldId), eq(posts.authorType, "brand"), eq(posts.status, "published")))
      .all()
      .filter((p) => p.publishedTick === t - 6);
    for (const post of secondWaveDue) {
      runEngagementWave(worldId, post.id, t, 2);
    }

    // (b) funnel rolls for this tick's profile visits
    await runFunnel(worldId, t);

    // (b2) personas continue (or ghost) their DM conversations
    await runPersonaDmReplies(worldId, t);

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
    await runCommunityPass(worldId);

    // (e) day boundary: follower churn, expire stale proposals, analyst, coach
    if (t % 24 === 0) {
      const churned = applyFollowerChurn(worldId, t);
      if (churned > 0) {
        logActivity({
          worldId,
          tick: t,
          actor: "system",
          action: "follower_churn",
          status: "ok",
          summary: `${churned} follower(s) left after a heavy posting day`,
        });
      }
      expireStaleProposals(worldId, t);
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
