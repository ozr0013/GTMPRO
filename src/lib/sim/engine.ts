import { db } from "@/lib/db/client";
import { engagements, personas, posts, worlds } from "@/lib/db/schema";
import type { Archetype, PersonaHidden, WorldConfig } from "@/lib/types";
import { subRng } from "@/lib/rng";
import { postStreamKey } from "./streams";
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

/** Probability scale for a high-scoring non-follower to follow the brand. */
const FOLLOW_PROPENSITY = 0.3;
/** Wave-1 interaction rate at/above which the platform's early-velocity boost kicks in. */
const VELOCITY_THRESHOLD = 0.3;

/**
 * Engagement wave for a post. Idempotent per (post, persona): personas that already
 * engaged with the post are excluded, so wave 2 never duplicates rows.
 * - wave 1 (publish tick): followers + interest-weighted discovery sample.
 *   RNG streams identical to the original single-wave implementation.
 * - wave 2 (publish + 6h): fresh non-follower discovery only; sample size scaled by
 *   the hidden early-velocity boost when wave 1 interactions ran hot, or halved when
 *   they didn't. Uses separate "disc2"/"eng2" streams.
 */
export function runEngagementWave(worldId: string, postId: string, tick: number, wave: 1 | 2 = 1): void {
  const world = db.select().from(worlds).where(eq(worlds.id, worldId)).get()!;
  const post = db.select().from(posts).where(eq(posts.id, postId)).get()!;
  const config = world.config as WorldConfig;
  const all = db.select().from(personas).where(eq(personas.worldId, worldId)).all();

  const prior = db.select().from(engagements).where(eq(engagements.postId, postId)).all();
  const alreadyEngaged = new Set(prior.map((e) => e.personaId));

  const dayStart = tick - (tick % 24);
  const brandPostsToday = db
    .select()
    .from(posts)
    .where(and(eq(posts.worldId, worldId), eq(posts.authorType, "brand")))
    .all()
    .filter((p) => (p.publishedTick ?? -1) >= dayStart).length;

  const followers = all.filter((p) => p.isFollower && !alreadyEngaged.has(p.id));
  const nonFollowers = all.filter((p) => !p.isFollower && !alreadyEngaged.has(p.id));

  // discovery sample: weighted by interest match, at least discoveryFloor personas
  let sampleSize = Math.max(
    config.algo.discoveryFloor,
    Math.floor(all.filter((p) => !p.isFollower).length * config.algo.discoveryRate),
  );
  // rng streams are keyed on stable identifiers (world seed, post content/slot,
  // persona handle) — never row UUIDs — so identical seeds yield identical outcomes.
  const streamKey = postStreamKey(post);
  const discPrefix = wave === 1 ? "disc" : "disc2";
  const engPrefix = wave === 1 ? "eng" : "eng2";

  if (wave === 2) {
    // hidden platform dynamic the agent must discover: strong first-wave velocity
    // widens second-wave distribution; weak velocity halves it
    const impressions = prior.filter((e) => e.kind === "impression").length;
    const interactions = prior.filter((e) => ["like", "comment", "save"].includes(e.kind)).length;
    const rate = interactions / Math.max(1, impressions);
    sampleSize = Math.floor(
      sampleSize * (rate >= VELOCITY_THRESHOLD ? config.algo.earlyVelocityBoost : 0.5),
    );
  }

  const ranked = nonFollowers
    .map((p) => {
      const h = p.hidden as PersonaHidden;
      const w = h.interests.includes(post.topic) ? 1 : 0.2;
      return { p, key: w * subRng(world.seed, discPrefix, streamKey, p.handle)() };
    })
    .sort((a, b) => b.key - a.key)
    .slice(0, Math.min(sampleSize, nonFollowers.length))
    .map((r) => r.p);

  const reachSet = wave === 1 ? [...followers, ...ranked] : ranked;
  const ctx: ScoreContext = { config, brandPostsToday, tick };

  for (const persona of reachSet) {
    const hidden = persona.hidden as PersonaHidden;
    const rng = subRng(world.seed, engPrefix, streamKey, persona.handle);
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

    // deeply-engaged non-followers may follow (extra rng draw AFTER the noise draw,
    // so all pre-existing wave-1 outcomes are unchanged)
    if (!persona.isFollower && score >= THRESHOLDS.profile_visit) {
      if (rng() < FOLLOW_PROPENSITY * hidden.engagementPropensity) {
        db.update(personas).set({ isFollower: true }).where(eq(personas.id, persona.id)).run();
        insert("follow");
      }
    }
  }
}

/**
 * Hidden platform dynamic: posting more than 4 brand posts in a sim-day annoys the
 * audience — each follower rolls a 5% unfollow at the day boundary. Returns churn count.
 */
export function applyFollowerChurn(worldId: string, tick: number): number {
  const world = db.select().from(worlds).where(eq(worlds.id, worldId)).get()!;
  const dayStart = tick - 24;
  const brandPostsToday = db
    .select()
    .from(posts)
    .where(and(eq(posts.worldId, worldId), eq(posts.authorType, "brand")))
    .all()
    .filter((p) => (p.publishedTick ?? -1) > dayStart && (p.publishedTick ?? -1) <= tick).length;
  if (brandPostsToday <= 4) return 0;

  const day = Math.floor(tick / 24);
  let churned = 0;
  const followers = db
    .select()
    .from(personas)
    .where(and(eq(personas.worldId, worldId), eq(personas.isFollower, true)))
    .all();
  for (const persona of followers) {
    if (subRng(world.seed, "churn", persona.handle, day)() < 0.05) {
      db.update(personas).set({ isFollower: false }).where(eq(personas.id, persona.id)).run();
      churned++;
    }
  }
  return churned;
}
