import { db } from "@/lib/db/client";
import { banditArms, banditObservations } from "@/lib/db/schema";
import type { Rng } from "@/lib/rng";
import { eq, and, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";

/** Marsaglia-Tsang-free gamma sampler adequate for demo-scale Beta sampling. */
export function sampleGamma(shape: number, rng: Rng): number {
  // sum-of-exponentials for integer part + Johnk for fractional part
  let g = 0;
  const n = Math.floor(shape);
  for (let i = 0; i < n; i++) g += -Math.log(1 - rng());
  const frac = shape - n;
  if (frac > 1e-9) {
    let x = 0,
      y = 0;
    do {
      x = Math.pow(rng(), 1 / frac);
      y = x + Math.pow(rng(), 1 / (1 - frac));
    } while (y > 1 || y === 0);
    g += (x / y) * -Math.log(1 - rng());
  }
  return g;
}

export function sampleBeta(alpha: number, beta: number, rng: Rng): number {
  const a = sampleGamma(alpha, rng);
  const b = sampleGamma(beta, rng);
  return a / (a + b);
}

export function sampleArm(worldId: string, rng: Rng) {
  const arms = db
    .select()
    .from(banditArms)
    .where(and(eq(banditArms.worldId, worldId), eq(banditArms.enabled, true)))
    .all();
  let best = arms[0],
    bestTheta = -1;
  for (const arm of arms) {
    const theta = sampleBeta(arm.alpha, arm.beta, rng);
    if (theta > bestTheta) {
      bestTheta = theta;
      best = arm;
    }
  }
  return best;
}

export function recordReward(armId: string, postId: string, reward: number, tick: number): void {
  const arm = db.select().from(banditArms).where(eq(banditArms.id, armId)).get()!;
  db.update(banditArms)
    .set({ alpha: arm.alpha + reward, beta: arm.beta + (1 - reward) })
    .where(eq(banditArms.id, armId))
    .run();
  db.insert(banditObservations).values({ id: randomUUID(), armId, postId, reward, tick }).run();
}

/** Funnel counts the bandit and playbook score. Predictions are calibration-only. */
export interface FunnelActual {
  impressions: number;
  likes: number;
  linkClicks: number;
  signups: number;
  dmsStarted?: number;
  meetings?: number;
}

/**
 * Absolute GTM value of a post, 0..1. Deeper funnel stages weigh more; meetings
 * are the headline. Per-impression so reach inflation cannot fake a win.
 *
 * Deliberately independent of the strategist's predicted ranges — those live in
 * calibration. Scoring "did we beat our own forecast" taught the bandit where
 * the model under-predicted, not which content worked, and flattened toward 0.5
 * as calibration improved.
 *
 * Saturation is a fixed rate (not a rolling world baseline) so the same outcome
 * always scores the same, a meeting always outranks a like, and tests stay
 * deterministic.
 */
export const REWARD_WEIGHTS = {
  likes: 0.05,
  linkClicks: 1,
  signups: 3,
  dmsStarted: 3,
  meetings: 10,
} as const;

/** Value-per-impression that maps to reward 1. A booked meeting on ~25 impressions saturates. */
export const REWARD_SATURATION = 0.4;

export function computeReward(actual: FunnelActual): number {
  const value =
    REWARD_WEIGHTS.likes * (actual.likes ?? 0) +
    REWARD_WEIGHTS.linkClicks * (actual.linkClicks ?? 0) +
    REWARD_WEIGHTS.signups * (actual.signups ?? 0) +
    REWARD_WEIGHTS.dmsStarted * (actual.dmsStarted ?? 0) +
    REWARD_WEIGHTS.meetings * (actual.meetings ?? 0);
  if (value <= 0) return 0;
  const denom = Math.max(actual.impressions, 1) * REWARD_SATURATION;
  return Math.min(1, value / denom);
}

export interface ArmStats {
  id: string;
  archetype: string;
  timeSlot: string;
  alpha: number;
  beta: number;
  mean: number;
  n: number;
  sample: number;
}

/** Per-arm means, observation counts, and a fresh Thompson sample for strategist context. */
export function getArmStats(worldId: string, rng: Rng): ArmStats[] {
  const arms = db
    .select()
    .from(banditArms)
    .where(and(eq(banditArms.worldId, worldId), eq(banditArms.enabled, true)))
    .all();
  return arms.map((arm) => {
    const n = db
      .select()
      .from(banditObservations)
      .where(eq(banditObservations.armId, arm.id))
      .all().length;
    return {
      id: arm.id,
      archetype: arm.archetype,
      timeSlot: arm.timeSlot,
      alpha: arm.alpha,
      beta: arm.beta,
      mean: arm.alpha / (arm.alpha + arm.beta),
      n,
      sample: sampleBeta(arm.alpha, arm.beta, rng),
    };
  });
}

export interface ArmDistribution {
  id: string;
  archetype: string;
  timeSlot: string;
  alpha: number;
  beta: number;
  mean: number;
  recentRewards: number[];
}

/** α/β plus last-20 observation rewards — Track C Brain view consumes this. */
export function getArmDistributions(worldId: string): ArmDistribution[] {
  const arms = db.select().from(banditArms).where(eq(banditArms.worldId, worldId)).all();
  return arms.map((arm) => {
    const recentRewards = db
      .select()
      .from(banditObservations)
      .where(eq(banditObservations.armId, arm.id))
      .orderBy(desc(banditObservations.tick))
      .all()
      .slice(0, 20)
      .map((o) => o.reward);
    return {
      id: arm.id,
      archetype: arm.archetype,
      timeSlot: arm.timeSlot,
      alpha: arm.alpha,
      beta: arm.beta,
      mean: arm.alpha / (arm.alpha + arm.beta),
      recentRewards,
    };
  });
}
