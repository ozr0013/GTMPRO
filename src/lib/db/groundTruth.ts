// The reveal: what the world was actually configured to reward, next to what the
// agent worked out from outcomes alone.
//
// This is the only place in the app that reads `worlds.config` for display. The
// agent never sees any of it — the strategist prompt gets playbook rules, bandit
// posteriors and observed signals, never the affinity matrix or persona internals.
// That is what makes the comparison meaningful rather than circular: learning is
// scored against hidden ground truth, not self-graded by the same model family.

import { db } from "./client";
import { banditArms, banditObservations, personas, playbookRules, playbookVersions, worlds } from "./schema";
import type { Archetype, PersonaHidden, TimeSlot, WorldConfig } from "@/lib/types";
import { ARCHETYPES, TIME_SLOTS } from "@/lib/types";
import { and, desc, eq } from "drizzle-orm";

export interface RankedItem {
  key: string;
  /** 0..1, normalised within its own dimension so truth and belief are comparable */
  score: number;
  /** supporting evidence count on the learned side; undefined on the truth side */
  observations?: number;
}

export interface RevealDimension {
  label: string;
  /** what the world was configured to reward */
  truth: RankedItem[];
  /** what the agent believes, derived only from outcomes it observed */
  learned: RankedItem[];
  truthTop: string;
  learnedTop: string | null;
  agrees: boolean;
  /** total observations behind the learned side — low means "not enough evidence yet" */
  evidence: number;
}

export interface LearnedRule {
  ruleKey: string;
  category: string;
  text: string;
  sourceType: string;
}

export interface GroundTruthReveal {
  /** segment -> archetype -> affinity, the raw hidden matrix */
  affinity: Record<string, Record<Archetype, number>>;
  segmentSizes: Record<string, number>;
  /** best archetype per segment, straight from the hidden config */
  segmentBest: Record<string, Archetype>;
  dimensions: RevealDimension[];
  algo: WorldConfig["algo"];
  totalObservations: number;
  /** what the agent wrote down about content + timing — read side-by-side with the truth */
  learnedRules: LearnedRule[];
}

function rank(scores: Record<string, number>, observations?: Record<string, number>): RankedItem[] {
  const max = Math.max(...Object.values(scores), 0);
  return Object.entries(scores)
    .map(([key, value]) => ({
      key,
      score: max > 0 ? value / max : 0,
      observations: observations?.[key],
    }))
    .sort((a, b) => b.score - a.score);
}

export function getGroundTruthReveal(worldId: string): GroundTruthReveal | null {
  const world = db.select().from(worlds).where(eq(worlds.id, worldId)).get();
  if (!world) return null;
  const config = world.config as WorldConfig;
  const people = db.select().from(personas).where(eq(personas.worldId, worldId)).all();
  const arms = db.select().from(banditArms).where(eq(banditArms.worldId, worldId)).all();

  const observationsByArm = new Map<string, number>();
  for (const arm of arms) {
    observationsByArm.set(
      arm.id,
      db.select().from(banditObservations).where(eq(banditObservations.armId, arm.id)).all().length,
    );
  }
  const totalObservations = [...observationsByArm.values()].reduce((s, n) => s + n, 0);

  // ── segment sizes weight the truth: a preference held by a big segment matters more
  const segmentSizes: Record<string, number> = {};
  for (const p of people) segmentSizes[p.segment] = (segmentSizes[p.segment] ?? 0) + 1;

  // ── archetype: hidden affinity, weighted by how many personas hold it
  const archetypeTruth: Record<string, number> = {};
  for (const archetype of ARCHETYPES) {
    let weighted = 0;
    let total = 0;
    for (const [segment, size] of Object.entries(segmentSizes)) {
      const affinity = config.affinity?.[segment]?.[archetype];
      if (affinity === undefined) continue;
      weighted += affinity * size;
      total += size;
    }
    archetypeTruth[archetype] = total > 0 ? weighted / total : 0;
  }

  // ── archetype: what the bandit believes, averaged over that archetype's slots
  const archetypeLearned: Record<string, number> = {};
  const archetypeObs: Record<string, number> = {};
  for (const archetype of ARCHETYPES) {
    const own = arms.filter((a) => a.archetype === archetype);
    const mean =
      own.reduce((s, a) => s + a.alpha / (a.alpha + a.beta), 0) / Math.max(own.length, 1);
    archetypeLearned[archetype] = mean;
    archetypeObs[archetype] = own.reduce((s, a) => s + (observationsByArm.get(a.id) ?? 0), 0);
  }

  // ── time slot: truth is how many personas are actually awake in that window
  const slotTruth: Record<string, number> = {};
  for (const [slot, hours] of Object.entries(TIME_SLOTS)) {
    slotTruth[slot] = people.filter((p) =>
      (p.hidden as PersonaHidden).activeHours?.some((h) => hours.includes(h)),
    ).length;
  }

  const slotLearned: Record<string, number> = {};
  const slotObs: Record<string, number> = {};
  for (const slot of Object.keys(TIME_SLOTS) as TimeSlot[]) {
    const own = arms.filter((a) => a.timeSlot === slot);
    slotLearned[slot] =
      own.reduce((s, a) => s + a.alpha / (a.alpha + a.beta), 0) / Math.max(own.length, 1);
    slotObs[slot] = own.reduce((s, a) => s + (observationsByArm.get(a.id) ?? 0), 0);
  }

  const segmentBest: Record<string, Archetype> = {};
  for (const segment of Object.keys(segmentSizes)) {
    const row = config.affinity?.[segment];
    if (!row) continue;
    segmentBest[segment] = ARCHETYPES.reduce((best, a) => ((row[a] ?? 0) > (row[best] ?? 0) ? a : best));
  }

  const build = (
    label: string,
    truthScores: Record<string, number>,
    learnedScores: Record<string, number>,
    obs: Record<string, number>,
  ): RevealDimension => {
    const truth = rank(truthScores);
    const learned = rank(learnedScores, obs);
    const evidence = Object.values(obs).reduce((s, n) => s + n, 0);
    // with no observations every arm sits on the same prior — claiming a winner
    // there would be theatre, so the learned side stays undecided
    const learnedTop = evidence > 0 ? learned[0].key : null;
    return {
      label,
      truth,
      learned,
      truthTop: truth[0]?.key ?? "",
      learnedTop,
      agrees: learnedTop !== null && learnedTop === truth[0]?.key,
      evidence,
    };
  };

  // the agent's own written beliefs about content + timing, for side-by-side reading
  const latestVersion = db
    .select()
    .from(playbookVersions)
    .where(eq(playbookVersions.worldId, worldId))
    .orderBy(desc(playbookVersions.version))
    .get();
  const learnedRules: LearnedRule[] = latestVersion
    ? db
        .select()
        .from(playbookRules)
        .where(and(eq(playbookRules.worldId, worldId), eq(playbookRules.versionId, latestVersion.id)))
        .all()
        .filter((r) => r.category === "content" || r.category === "timing")
        .map((r) => ({
          ruleKey: r.ruleKey,
          category: r.category,
          text: r.text,
          sourceType: (r.evidence as { sourceType?: string })?.sourceType ?? "seed",
        }))
    : [];

  return {
    affinity: config.affinity ?? {},
    segmentSizes,
    segmentBest,
    algo: config.algo,
    totalObservations,
    learnedRules,
    dimensions: [
      build("Content archetype", archetypeTruth, archetypeLearned, archetypeObs),
      build("Time slot", slotTruth, slotLearned, slotObs),
    ],
  };
}
