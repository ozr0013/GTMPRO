// Sandbox dreaming: before proposing, rank every (archetype x slot x topic)
// candidate against the agent's LEARNED model of the audience.
//
// Epistemology matters here: the dreamer must NEVER read `worlds.config` or
// `personas.hidden` — that would hand the agent a free oracle and collapse the
// product's core claim that it discovers the hidden ground truth from outcomes.
// The dream is built only from what the agent has observed:
//   - bandit posterior means per (archetype, slot) arm,
//   - observed per-topic engagement rates (likes / impressions on its own posts),
//   - observed per-slot engagement rates (same, bucketed by publish slot).
// Laplace smoothing keeps unexplored candidates exploration-neutral instead of
// punishing them for being untried, and every factor reports its evidence count
// so the UI can say "no dream signal yet" honestly.

import { db } from "@/lib/db/client";
import { banditArms, engagements, posts, worlds } from "@/lib/db/schema";
import type { Archetype, TimeSlot, WorldConfig } from "@/lib/types";
import { ARCHETYPES, TIME_SLOTS } from "@/lib/types";
import { eq, and } from "drizzle-orm";

export interface DreamScore {
  archetype: Archetype;
  timeSlot: TimeSlot;
  topic: string;
  /** learned-model score, 0..1-ish (posterior mean x smoothed observed rates) */
  score: number;
  rank: number;
  /** observations backing each factor — 0 everywhere means "pure prior" */
  evidence: { arm: number; topic: number; slot: number };
}

export interface DreamRanking {
  candidates: DreamScore[];
  /** total scored posts the dream is grounded in; 0 = no signal yet */
  totalObservations: number;
}

const SLOTS: TimeSlot[] = ["morning", "midday", "evening"];

function slotOfTick(tick: number): TimeSlot | null {
  const hour = tick % 24;
  for (const slot of SLOTS) {
    if (TIME_SLOTS[slot].includes(hour)) return slot;
  }
  return null;
}

/** Laplace-smoothed rate: unobserved cells sit at 0.5 (exploration-neutral). */
function smoothedRate(likes: number, impressions: number): number {
  return (likes + 1) / (impressions + 2);
}

export function dreamCandidates(worldId: string): DreamRanking {
  const world = db.select().from(worlds).where(eq(worlds.id, worldId)).get()!;
  const topics = (world.config as WorldConfig).topics;

  const arms = db.select().from(banditArms).where(eq(banditArms.worldId, worldId)).all();
  const armMean = new Map<string, number>();
  for (const arm of arms) {
    armMean.set(`${arm.archetype}/${arm.timeSlot}`, arm.alpha / (arm.alpha + arm.beta));
  }
  // n beyond the (2,2) prior = real observations
  const armObs = new Map<string, number>();
  for (const arm of arms) {
    armObs.set(`${arm.archetype}/${arm.timeSlot}`, Math.round(arm.alpha + arm.beta - 4));
  }

  // observed engagement per topic and per publish slot — brand posts only
  const brandPosts = db
    .select()
    .from(posts)
    .where(and(eq(posts.worldId, worldId), eq(posts.authorType, "brand")))
    .all()
    .filter((p) => p.publishedTick != null);
  const postById = new Map(brandPosts.map((p) => [p.id, p]));

  const topicStats = new Map<string, { likes: number; impressions: number }>();
  const slotStats = new Map<TimeSlot, { likes: number; impressions: number }>();
  for (const e of db.select().from(engagements).where(eq(engagements.worldId, worldId)).all()) {
    const post = postById.get(e.postId);
    if (!post) continue;
    const slot = slotOfTick(post.publishedTick!);
    const t = topicStats.get(post.topic) ?? { likes: 0, impressions: 0 };
    if (e.kind === "impression") t.impressions += 1;
    if (e.kind === "like") t.likes += 1;
    topicStats.set(post.topic, t);
    if (slot) {
      const s = slotStats.get(slot) ?? { likes: 0, impressions: 0 };
      if (e.kind === "impression") s.impressions += 1;
      if (e.kind === "like") s.likes += 1;
      slotStats.set(slot, s);
    }
  }

  const totalObservations = [...armObs.values()].reduce((s, n) => s + Math.max(n, 0), 0);

  const candidates: DreamScore[] = [];
  for (const archetype of ARCHETYPES) {
    for (const timeSlot of SLOTS) {
      for (const topic of topics) {
        const t = topicStats.get(topic) ?? { likes: 0, impressions: 0 };
        const s = slotStats.get(timeSlot) ?? { likes: 0, impressions: 0 };
        candidates.push({
          archetype,
          timeSlot,
          topic,
          score:
            (armMean.get(`${archetype}/${timeSlot}`) ?? 0.5) *
            smoothedRate(t.likes, t.impressions) *
            smoothedRate(s.likes, s.impressions),
          rank: 0,
          evidence: {
            arm: Math.max(armObs.get(`${archetype}/${timeSlot}`) ?? 0, 0),
            topic: t.impressions,
            slot: s.impressions,
          },
        });
      }
    }
  }

  // stable, deterministic ordering: score desc, then enumeration order
  candidates.sort((a, b) => b.score - a.score);
  candidates.forEach((c, i) => {
    c.rank = i + 1;
  });

  return { candidates, totalObservations };
}

/** The dream line rendered into the strategist's context. */
export function renderDreamPreview(ranking: DreamRanking, top = 5): string {
  if (ranking.totalObservations === 0) {
    return "(no dream signal yet — nothing has been scored; every candidate sits on the prior)";
  }
  return ranking.candidates
    .slice(0, top)
    .map(
      (c) =>
        `- #${c.rank} ${c.archetype}/${c.timeSlot}/${c.topic} score=${c.score.toFixed(3)} (evidence: arm n=${c.evidence.arm}, topic n=${c.evidence.topic}, slot n=${c.evidence.slot})`,
    )
    .join("\n");
}

/** The dream evidence attached to a specific proposal's card. */
export function dreamFor(
  ranking: DreamRanking,
  archetype: Archetype,
  timeSlot: TimeSlot,
  topic: string,
): { rank: number; of: number; score: number } | null {
  const hit = ranking.candidates.find(
    (c) => c.archetype === archetype && c.timeSlot === timeSlot && c.topic === topic,
  );
  if (!hit || ranking.totalObservations === 0) return null;
  return { rank: hit.rank, of: ranking.candidates.length, score: Number(hit.score.toFixed(3)) };
}
