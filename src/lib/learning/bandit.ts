import { db } from "@/lib/db/client";
import { banditArms, banditObservations } from "@/lib/db/schema";
import type { PredictedEffect } from "@/lib/types";
import type { Rng } from "@/lib/rng";
import { eq, and } from "drizzle-orm";
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

/** Fraction of funnel metrics at/above predicted midpoint; weights deeper funnel higher. */
export function computeReward(
  actual: { impressions: number; likes: number; linkClicks: number; signups: number },
  predicted: PredictedEffect,
): number {
  const mid = (r: [number, number]) => (r[0] + r[1]) / 2;
  const hits = [
    { w: 1, ok: actual.impressions >= mid(predicted.impressions) },
    { w: 1, ok: actual.likes >= mid(predicted.likes) },
    { w: 2, ok: actual.linkClicks >= mid(predicted.linkClicks) },
    { w: 2, ok: actual.signups >= mid(predicted.signups) },
  ];
  const total = hits.reduce((s, h) => s + h.w, 0);
  return hits.reduce((s, h) => s + (h.ok ? h.w : 0), 0) / total;
}
