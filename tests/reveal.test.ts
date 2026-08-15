import { describe, it, expect } from "vitest";
import { buildTinyWorld } from "./fixtures/world";
import { db } from "@/lib/db/client";
import { banditArms, banditObservations } from "@/lib/db/schema";
import { getGroundTruthReveal } from "@/lib/db/groundTruth";
import { generateWorld } from "@/lib/sim/genesis";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

describe("ground-truth reveal (brain answer key)", () => {
  it("returns null for an unknown world", () => {
    expect(getGroundTruthReveal("no-such-world")).toBeNull();
  });

  it("derives dimension truths from the hidden config and refuses to grade an untested world", () => {
    const { worldId } = buildTinyWorld("reveal-seed");
    const reveal = getGroundTruthReveal(worldId)!;

    // fixture: education and product tie on weighted affinity; ARCHETYPES order
    // breaks the tie toward education (stable sort) — documented behavior.
    const archetype = reveal.dimensions.find((d) => d.label === "Content archetype")!;
    expect(archetype.truthTop).toBe("education");
    // active-hours: every even persona is awake in all three windows, odd personas
    // miss mornings — midday/evening tie at 12, morning trails at 6.
    const slot = reveal.dimensions.find((d) => d.label === "Time slot")!;
    expect(slot.truthTop).toBe("midday");
    expect(slot.truth.find((t) => t.key === "morning")!.score).toBeLessThan(1);

    // fresh world: nothing observed → no learned verdict, honestly
    for (const d of reveal.dimensions) {
      expect(d.evidence).toBe(0);
      expect(d.learnedTop).toBeNull();
      expect(d.agrees).toBe(false);
    }
    expect(reveal.totalObservations).toBe(0);
    expect(Object.values(reveal.segmentSizes)).toEqual([4, 4, 4]);
    expect(reveal.learnedRules.length).toBeGreaterThan(0); // seed content/timing hypotheses
  });

  it("grades agreement once observations move a posterior", () => {
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

    const reveal = getGroundTruthReveal(worldId)!;
    const archetype = reveal.dimensions.find((d) => d.label === "Content archetype")!;
    expect(archetype.evidence).toBe(1);
    expect(archetype.learnedTop).toBe("education");
    expect(archetype.agrees).toBe(true);
    const slot = reveal.dimensions.find((d) => d.label === "Time slot")!;
    expect(slot.learnedTop).toBe("midday");
    expect(slot.agrees).toBe(true);
  });

  it("holds together on a genesis-scale world (100 personas)", async () => {
    const { worldId } = await generateWorld("Cold brew concentrate for coffee obsessives", {
      seed: "reveal-genesis",
    });
    const reveal = getGroundTruthReveal(worldId)!;

    expect(Object.values(reveal.segmentSizes).reduce((s, n) => s + n, 0)).toBe(100);
    expect(reveal.dimensions).toHaveLength(2);
    for (const d of reveal.dimensions) {
      expect(d.truth.length).toBeGreaterThan(0);
      expect(Math.max(...d.truth.map((t) => t.score))).toBe(1); // normalized within dimension
    }
    expect(Object.keys(reveal.segmentBest).length).toBeGreaterThan(0);
    expect(reveal.learnedRules.length).toBeGreaterThan(0);
  });
});
