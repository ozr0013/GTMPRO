import { describe, it, expect } from "vitest";
import { db } from "@/lib/db/client";
import { posts } from "@/lib/db/schema";
import { generateWorld } from "@/lib/sim/genesis";
import { generateAmbientPosts, ambientScheduleFor } from "@/lib/sim/ambient";
import { buildTinyWorld } from "./fixtures/world";
import { eq, and } from "drizzle-orm";

async function ambientWorld(seed: string): Promise<string> {
  const { worldId } = await generateWorld("Cold brew concentrate", seed);
  return worldId;
}

function runDay(worldId: string, day: number): number {
  let created = 0;
  for (let hour = 0; hour < 24; hour++) {
    created += generateAmbientPosts(worldId, day * 24 + hour);
  }
  return created;
}

describe("ambient content", () => {
  it("fixture worlds (no ambient config) produce nothing", () => {
    const { worldId } = buildTinyWorld("amb-fixture");
    expect(runDay(worldId, 0)).toBe(0);
  });

  it("each ambient account posts 2-4 times per sim-day", async () => {
    const worldId = await ambientWorld("amb-seed-a");
    const created = runDay(worldId, 0);
    // mock genesis has 3 ambient accounts
    expect(created).toBeGreaterThanOrEqual(6);
    expect(created).toBeLessThanOrEqual(12);

    const rows = db
      .select()
      .from(posts)
      .where(and(eq(posts.worldId, worldId), eq(posts.authorType, "ambient")))
      .all();
    expect(rows.length).toBe(created);
    for (const row of rows) {
      expect(row.ambientAuthor).toBeTruthy();
      expect(row.caption.length).toBeGreaterThan(10);
      expect(row.caption).not.toContain("{topic}");
    }
  });

  it("schedules are deterministic per seed and vary by day", async () => {
    const a = ambientScheduleFor("seed-x", "daily-drip", 0);
    const b = ambientScheduleFor("seed-x", "daily-drip", 0);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(2);
    expect(a.length).toBeLessThanOrEqual(4);

    const days = [0, 1, 2, 3, 4].map((d) => ambientScheduleFor("seed-x", "daily-drip", d));
    const distinct = new Set(days.map((d) => JSON.stringify(d)));
    expect(distinct.size).toBeGreaterThan(1);
  });
});
