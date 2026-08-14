import { db } from "@/lib/db/client";
import { engagements, personas, posts, worlds } from "@/lib/db/schema";
import type { Archetype, PersonaHidden, WorldConfig } from "@/lib/types";
import { subRng } from "@/lib/rng";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

export interface ScoreContext {
  config: WorldConfig;
  brandPostsToday: number;
  tick: number;
}

/** Pure scoring function, exported for tests. `noise` is a uniform [0,1) sample. */
export function scorePersonaPost(
  hidden: PersonaHidden,
  segment: string,
  archetype: Archetype,
  topic: string,
  ctx: ScoreContext,
  noise: number,
): number {
  const interest = hidden.interests.includes(topic) ? 1 : 0.15;
  const affinity = ctx.config.affinity[segment]?.[archetype] ?? 0.5;
  const hour = ctx.tick % 24;
  const timeMatch = hidden.activeHours.includes(hour) ? 1 : 0.35;
  let score =
    0.4 * interest + 0.25 * affinity + 0.15 * timeMatch + 0.2 * hidden.engagementPropensity;
  if (ctx.brandPostsToday > ctx.config.algo.maxOrganicReachPostsPerDay) {
    score *= ctx.config.algo.overPostPenalty;
  }
  return score + (noise - 0.5) * 0.2; // noise in [-0.1, +0.1)
}

const THRESHOLDS = { like: 0.6, comment: 0.75, save: 0.8, profile_visit: 0.85 } as const;

export function runEngagementWave(worldId: string, postId: string, tick: number): void {
  const world = db.select().from(worlds).where(eq(worlds.id, worldId)).get()!;
  const post = db.select().from(posts).where(eq(posts.id, postId)).get()!;
  const config = world.config as WorldConfig;
  const all = db.select().from(personas).where(eq(personas.worldId, worldId)).all();

  const dayStart = tick - (tick % 24);
  const brandPostsToday = db
    .select()
    .from(posts)
    .where(and(eq(posts.worldId, worldId), eq(posts.authorType, "brand")))
    .all()
    .filter((p) => (p.publishedTick ?? -1) >= dayStart).length;

  const followers = all.filter((p) => p.isFollower);
  const nonFollowers = all.filter((p) => !p.isFollower);

  // discovery sample: weighted by interest match, at least discoveryFloor personas
  const sampleSize = Math.max(
    config.algo.discoveryFloor,
    Math.floor(nonFollowers.length * config.algo.discoveryRate),
  );
  // rng streams are keyed on stable identifiers (world seed, post id, persona
  // handle) — never row UUIDs — so identical seeds yield identical outcomes.
  const ranked = nonFollowers
    .map((p) => {
      const h = p.hidden as PersonaHidden;
      const w = h.interests.includes(post.topic) ? 1 : 0.2;
      return { p, key: w * subRng(world.seed, "disc", postId, p.handle)() };
    })
    .sort((a, b) => b.key - a.key)
    .slice(0, Math.min(sampleSize, nonFollowers.length))
    .map((r) => r.p);

  const reachSet = [...followers, ...ranked];
  const ctx: ScoreContext = { config, brandPostsToday, tick };

  for (const persona of reachSet) {
    const hidden = persona.hidden as PersonaHidden;
    const rng = subRng(world.seed, "eng", postId, persona.handle);
    const score = scorePersonaPost(
      hidden,
      persona.segment,
      post.archetype as Archetype,
      post.topic,
      ctx,
      rng(),
    );
    const insert = (kind: string, commentText?: string) =>
      db
        .insert(engagements)
        .values({ id: randomUUID(), worldId, postId, personaId: persona.id, kind, commentText, tick })
        .run();

    insert("impression");
    if (score >= THRESHOLDS.like) insert("like");
    if (score >= THRESHOLDS.comment) insert("comment", "[pending persona voice]");
    if (score >= THRESHOLDS.save) insert("save");
    if (score >= THRESHOLDS.profile_visit) insert("profile_visit");
  }
}
