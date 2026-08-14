import { describe, it, expect } from "vitest";
import { buildTinyWorld } from "./fixtures/world";
import { db } from "@/lib/db/client";
import { banditArms } from "@/lib/db/schema";
import { sampleArm, recordReward, computeReward } from "@/lib/learning/bandit";
import { makeRng } from "@/lib/rng";
import type { PredictedEffect } from "@/lib/types";
import { eq, and } from "drizzle-orm";

describe("thompson sampling bandit", () => {
  it("converges to the better arm", () => {
    const { worldId } = buildTinyWorld("bandit-seed");
    const rng = makeRng("bandit-test");
    const good = db
      .select()
      .from(banditArms)
      .where(
        and(
          eq(banditArms.worldId, worldId),
          eq(banditArms.archetype, "education"),
          eq(banditArms.timeSlot, "morning"),
        ),
      )
      .get()!;
    // simulate rounds against ground truth: education/morning pays 0.8, others 0.2
    for (let i = 0; i < 60; i++) {
      const arm = sampleArm(worldId, rng);
      const payoff = arm.id === good.id ? (rng() < 0.8 ? 1 : 0) : (rng() < 0.2 ? 1 : 0);
      recordReward(arm.id, `post-${i}`, payoff, i);
    }
    let goodPicks = 0;
    for (let i = 0; i < 100; i++) if (sampleArm(worldId, rng).id === good.id) goodPicks++;
    expect(goodPicks).toBeGreaterThan(60);
  });

  it("computeReward blends funnel metrics into 0..1", () => {
    const predicted: PredictedEffect = {
      impressions: [20, 40],
      likes: [5, 10],
      linkClicks: [1, 3],
      signups: [0, 1],
    };
    expect(computeReward({ impressions: 45, likes: 12, linkClicks: 4, signups: 2 }, predicted)).toBe(1);
    expect(computeReward({ impressions: 5, likes: 0, linkClicks: 0, signups: 0 }, predicted)).toBe(0);
  });
});
