import { describe, it, expect } from "vitest";
import { buildTinyWorld } from "./fixtures/world";
import { db } from "@/lib/db/client";
import { banditArms } from "@/lib/db/schema";
import { recordReward } from "@/lib/learning/bandit";
import { getGroundTruthReveal, spearmanRho } from "@/lib/db/groundTruth";
import { eq, and } from "drizzle-orm";

describe("spearmanRho", () => {
  it("returns 1 for identical rankings", () => {
    expect(spearmanRho({ a: 3, b: 2, c: 1 }, { a: 30, b: 20, c: 10 })).toBeCloseTo(1);
  });

  it("returns -1 for reversed rankings", () => {
    expect(spearmanRho({ a: 3, b: 2, c: 1 }, { a: 1, b: 2, c: 3 })).toBeCloseTo(-1);
  });

  it("returns null when a ranking has no variance", () => {
    expect(spearmanRho({ a: 1, b: 2, c: 3 }, { a: 0.5, b: 0.5, c: 0.5 })).toBeNull();
  });
});

describe("ground-truth recovery", () => {
  it("is undefined before any arm is scored", () => {
    const { worldId } = buildTinyWorld("reveal-empty");
    const reveal = getGroundTruthReveal(worldId)!;
    expect(reveal.totalObservations).toBe(0);
    expect(reveal.recoveryRho).toBeNull();
    expect(reveal.dimensions.every((d) => d.rho === null && d.learnedTop === null)).toBe(true);
  });

  it("reports a high ρ when posteriors recover the hidden ranking", () => {
    const { worldId } = buildTinyWorld("reveal-learn");
    const reveal0 = getGroundTruthReveal(worldId)!;
    const truthOrder = reveal0.dimensions[0].truth.map((t) => t.key);

    // pay every slot of each archetype in proportion to hidden rank so the
    // bandit reconstructs the archetype ordering and time-slot means stay tied
    // (zero slot variance → slot ρ is null, recovery ρ = archetype ρ)
    for (const [i, archetype] of truthOrder.entries()) {
      const arms = db
        .select()
        .from(banditArms)
        .where(and(eq(banditArms.worldId, worldId), eq(banditArms.archetype, archetype)))
        .all();
      const payoff = 1 - i / (truthOrder.length - 1); // 1, 0.67, 0.33, 0
      for (const arm of arms) {
        recordReward(arm.id, `post-${archetype}-${arm.timeSlot}`, payoff, 24);
      }
    }

    const reveal = getGroundTruthReveal(worldId)!;
    expect(reveal.recoveryRho).not.toBeNull();
    expect(reveal.recoveryRho!).toBeGreaterThan(0.5);
    const archetypes = reveal.dimensions.find((d) => d.label === "Content archetype")!;
    expect(archetypes.agrees).toBe(true);
    expect(archetypes.rho).toBeGreaterThan(0.9);
  });
});
