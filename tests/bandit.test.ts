import { describe, it, expect } from "vitest";
import { buildTinyWorld } from "./fixtures/world";
import { db } from "@/lib/db/client";
import { banditArms } from "@/lib/db/schema";
import { sampleArm, recordReward, computeReward } from "@/lib/learning/bandit";
import { makeRng } from "@/lib/rng";
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

  it("computeReward scores absolute funnel value, not predicted ranges", () => {
    const dead = computeReward({ impressions: 5, likes: 0, linkClicks: 0, signups: 0 });
    const likesOnly = computeReward({ impressions: 40, likes: 20, linkClicks: 0, signups: 0 });
    const clicks = computeReward({ impressions: 40, likes: 8, linkClicks: 4, signups: 0 });
    const meeting = computeReward({
      impressions: 40,
      likes: 8,
      linkClicks: 2,
      signups: 1,
      dmsStarted: 1,
      meetings: 1,
    });
    const predictedDoesNotMatter = computeReward({
      impressions: 40,
      likes: 8,
      linkClicks: 2,
      signups: 1,
      dmsStarted: 1,
      meetings: 1,
    });

    expect(dead).toBe(0);
    expect(likesOnly).toBeGreaterThan(0);
    expect(clicks).toBeGreaterThan(likesOnly);
    expect(meeting).toBeGreaterThan(clicks);
    expect(meeting).toBeLessThanOrEqual(1);
    expect(predictedDoesNotMatter).toBe(meeting);
  });

  it("computeReward saturates a meeting-heavy post at 1", () => {
    expect(
      computeReward({
        impressions: 20,
        likes: 10,
        linkClicks: 4,
        signups: 2,
        dmsStarted: 1,
        meetings: 1,
      }),
    ).toBe(1);
  });
});
