import { describe, it, expect } from "vitest";
import { buildTinyWorld } from "./fixtures/world";
import { db } from "@/lib/db/client";
import { banditArms, banditObservations } from "@/lib/db/schema";
import { getGroundTruthReveal } from "@/lib/db/queries";
import { generateWorld } from "@/lib/sim/genesis";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

describe("ground-truth reveal (brain answer key)", () => {
  it("derives the hidden best arm from affinity x active-hours and grades an untested world honestly", () => {
    const { worldId } = buildTinyWorld("reveal-seed");
    const reveal = getGroundTruthReveal(worldId);

    // fixture: education and product tie on weighted affinity (0.667);
    // active hours put 40% of the audience in midday vs 30/30 morning/evening;
    // the tie breaks toward education (ARCHETYPES order) — documented behavior.
    expect(reveal.trueBest).toEqual({ archetype: "education", timeSlot: "midday" });
    expect(reveal.slotActivity.find((s) => s.slot === "midday")?.share).toBeCloseTo(0.4, 5);

    expect(reveal.arms).toHaveLength(12);
    const best = reveal.arms.find((a) => a.isTrueBest)!;
    expect(best.archetype).toBe("education");
    expect(best.timeSlot).toBe("midday");
    expect(best.trueScore).toBe(1); // normalized so the best arm reads 1.00

    // fresh world: nothing observed, nothing to grade
    expect(reveal.champion).toBeNull();
    expect(reveal.agreement).toBe("untested");
    expect(reveal.segments).toHaveLength(3);
    expect(reveal.segments.every((s) => s.personaCount === 4)).toBe(true);
  });

  it("grades the champion arm against the hidden truth once observations exist", () => {
    const { worldId } = buildTinyWorld("reveal-seed-2");
    const arm = db
      .select()
      .from(banditArms)
      .where(
        and(
          eq(banditArms.worldId, worldId),
          eq(banditArms.archetype, "education"),
          eq(banditArms.timeSlot, "midday"),
        ),
      )
      .get()!;
    db.insert(banditObservations)
      .values({ id: randomUUID(), armId: arm.id, postId: randomUUID(), reward: 1, tick: 24 })
      .run();
    db.update(banditArms).set({ alpha: 3 }).where(eq(banditArms.id, arm.id)).run();

    const reveal = getGroundTruthReveal(worldId);
    expect(reveal.champion).toEqual({ archetype: "education", timeSlot: "midday", observations: 1 });
    expect(reveal.agreement).toBe("match");
    expect(reveal.arms.find((a) => a.isChampion)?.isTrueBest).toBe(true);
  });

  it("holds together on a genesis-scale world (100 personas)", async () => {
    const { worldId } = await generateWorld("Cold brew concentrate for coffee obsessives", {
      seed: "reveal-genesis",
    });
    const reveal = getGroundTruthReveal(worldId);

    expect(reveal.segments.reduce((s, seg) => s + seg.personaCount, 0)).toBe(100);
    expect(reveal.arms).toHaveLength(12);
    // normalization invariants: shares sum to 1, exactly one arm reads 1.00
    expect(reveal.slotActivity.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 5);
    expect(reveal.arms.filter((a) => a.trueScore === 1)).toHaveLength(1);
    expect(reveal.arms.filter((a) => a.isTrueBest)).toHaveLength(1);
    expect(reveal.agreement).toBe("untested"); // nothing observed yet
    expect(reveal.learnedRules.length).toBeGreaterThan(0); // seed content/timing hypotheses
  });
});
