import { describe, it, expect } from "vitest";
import { db } from "@/lib/db/client";
import { worlds, personas, playbookRules, playbookVersions, banditArms } from "@/lib/db/schema";
import { generateWorld } from "@/lib/sim/genesis";
import { eq, and } from "drizzle-orm";

const PRODUCT = "Cold brew concentrate for coffee obsessives";

function personaFingerprint(worldId: string): string[] {
  return db
    .select()
    .from(personas)
    .where(eq(personas.worldId, worldId))
    .all()
    .map((p) => `${p.handle}|${p.segment}|${p.isFollower}|${JSON.stringify(p.hidden)}`)
    .sort();
}

describe("world genesis (mock mode)", () => {
  it("builds a complete ~100-persona world from a product description", async () => {
    const { worldId } = await generateWorld(PRODUCT, { seed: "gen-seed-a" });

    const world = db.select().from(worlds).where(eq(worlds.id, worldId)).get();
    expect(world).toBeDefined();
    expect(world!.productDescription).toBe(PRODUCT);

    const all = db.select().from(personas).where(eq(personas.worldId, worldId)).all();
    expect(all.length).toBe(100); // mock genesis sizes: 34 + 33 + 33
    expect(new Set(all.map((p) => p.segment)).size).toBe(3);
    expect(all.filter((p) => p.isFollower).length).toBeGreaterThanOrEqual(3);

    const version = db
      .select()
      .from(playbookVersions)
      .where(and(eq(playbookVersions.worldId, worldId), eq(playbookVersions.version, 1)))
      .get();
    expect(version).toBeDefined();
    const rules = db
      .select()
      .from(playbookRules)
      .where(eq(playbookRules.versionId, version!.id))
      .all();
    expect(rules.length).toBeGreaterThanOrEqual(2);

    const arms = db.select().from(banditArms).where(eq(banditArms.worldId, worldId)).all();
    expect(arms.length).toBe(12);
  });

  it("is deterministic for the same seed and distinct for different seeds", async () => {
    const a = await generateWorld(PRODUCT, { seed: "gen-seed-same" });
    const b = await generateWorld(PRODUCT, { seed: "gen-seed-same" });
    const c = await generateWorld(PRODUCT, { seed: "gen-seed-other" });

    expect(a.worldId).not.toBe(b.worldId);
    expect(personaFingerprint(a.worldId)).toEqual(personaFingerprint(b.worldId));
    expect(personaFingerprint(a.worldId)).not.toEqual(personaFingerprint(c.worldId));
  });
});
