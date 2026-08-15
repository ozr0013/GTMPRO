import { db } from "@/lib/db/client";
import { engagements, personas, posts, worlds } from "@/lib/db/schema";
import type { PersonaHidden } from "@/lib/types";
import { PersonaVoiceOutput, type PersonaVoiceOutputT } from "@/lib/contracts";
import { callAgent } from "@/lib/agents/models";
import { SYSTEM } from "@/lib/agents/prompts";
import { logActivity } from "@/lib/agents/log";
import { runAnalyst } from "@/lib/agents/analystRunner";
import { runCoach } from "@/lib/agents/coachRunner";
import { runEngagementWave } from "./engine";
import { runFunnelWave } from "./funnel";
import { TICKS_PER_DAY } from "./time";
import { and, eq } from "drizzle-orm";

export const PENDING_COMMENT = "[pending persona voice]";

// re-exported for server-side callers already importing from clock
export { TICKS_PER_DAY, formatSimTime } from "./time";

/**
 * The only way sim time moves. Request-driven by design (decision D8) — there are
 * no background timers anywhere in this codebase, so a world is frozen between
 * user actions and every run is reproducible.
 *
 * Per tick: publish anything due, run its engagement wave and funnel, give
 * commenters a voice; on a day boundary, evaluate outcomes and update the playbook.
 */
export async function advanceTicks(worldId: string, n: number): Promise<{ tick: number }> {
  const world = db.select().from(worlds).where(eq(worlds.id, worldId)).get()!;
  let tick = world.simTick;

  for (let i = 0; i < n; i++) {
    tick++;

    const due = db
      .select()
      .from(posts)
      .where(and(eq(posts.worldId, worldId), eq(posts.status, "scheduled")))
      .all()
      .filter((p) => p.scheduledTick <= tick);

    for (const post of due) {
      db.update(posts)
        .set({ status: "published", publishedTick: tick })
        .where(eq(posts.id, post.id))
        .run();

      runEngagementWave(worldId, post.id, tick);
      runFunnelWave(worldId, post.id, tick);
      await voiceComments(worldId, world.seed, post.id, post.caption);

      logActivity({
        worldId,
        tick,
        actor: "publisher",
        action: "publish",
        status: "ok",
        summary: `Published ${post.archetype} post: ${post.caption.slice(0, 60)}`,
        refType: "post",
        refId: post.id,
      });
    }

    // day boundary: judge yesterday, then learn from it
    if (tick % TICKS_PER_DAY === 0) {
      await runAnalyst(worldId, tick);
      await runCoach(worldId, tick);
    }

    db.update(worlds).set({ simTick: tick }).where(eq(worlds.id, worldId)).run();
  }

  return { tick };
}

/** The engine marks who commented; the persona model supplies what they said. */
async function voiceComments(
  worldId: string,
  worldSeed: string,
  postId: string,
  caption: string,
): Promise<void> {
  const pending = db
    .select()
    .from(engagements)
    .where(and(eq(engagements.worldId, worldId), eq(engagements.postId, postId), eq(engagements.kind, "comment")))
    .all()
    .filter((e) => e.commentText === PENDING_COMMENT);

  for (const comment of pending) {
    const persona = db.select().from(personas).where(eq(personas.id, comment.personaId)).get();
    if (!persona) continue;
    const hidden = persona.hidden as PersonaHidden;

    const result = await callAgent<PersonaVoiceOutputT>(
      "persona",
      PersonaVoiceOutput,
      SYSTEM.persona,
      [
        `You are @${persona.handle} (${persona.segment}). ${persona.bio}`,
        `Interests: ${hidden.interests.join(", ")}. Skepticism: ${hidden.skepticism.toFixed(2)}.`,
        `Post caption: ${caption}`,
      ].join("\n"),
      { worldSeed, refId: `${postId}:${persona.handle}` },
    );

    // a failed voice call leaves the placeholder rather than dropping the comment
    if (!result.ok) continue;
    db.update(engagements)
      .set({ commentText: result.data.commentText })
      .where(eq(engagements.id, comment.id))
      .run();
  }
}
