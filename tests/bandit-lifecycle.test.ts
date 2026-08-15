import { describe, it, expect } from "vitest";
import { buildTinyWorld } from "./fixtures/world";
import { db } from "@/lib/db/client";
import { banditArms, banditObservations, posts, worlds, engagements, personas } from "@/lib/db/schema";
import { decideProposal, runHeartbeat } from "@/lib/agents/orchestrator";
import { runAnalyst } from "@/lib/agents/analystRunner";
import { getArmDistributions, getArmStats } from "@/lib/learning/bandit";
import { makeRng } from "@/lib/rng";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

describe("bandit lifecycle", () => {
  it("heartbeat post persists banditArmId; analyst records exactly one reward", async () => {
    const { worldId } = buildTinyWorld("bandit-life");
    const stats = getArmStats(worldId, makeRng("stats"));
    expect(stats).toHaveLength(12);
    expect(stats[0].n).toBe(0);
    expect(getArmDistributions(worldId)).toHaveLength(12);

    const { proposalIds } = await runHeartbeat(worldId);
    await decideProposal(proposalIds[0], "approve");
    const post = db.select().from(posts).where(eq(posts.worldId, worldId)).all()[0]!;
    expect(post.banditArmId).toBeTruthy();
    const arm = db.select().from(banditArms).where(eq(banditArms.id, post.banditArmId!)).get()!;
    expect(arm).toBeTruthy();

    db.update(posts).set({ publishedTick: 0, status: "published" }).where(eq(posts.id, post.id)).run();
    db.update(worlds).set({ simTick: 24 }).where(eq(worlds.id, worldId)).run();
    const persona = db.select().from(personas).where(eq(personas.worldId, worldId)).all()[0]!;
    db.insert(engagements)
      .values({
        id: randomUUID(),
        worldId,
        postId: post.id,
        personaId: persona.id,
        kind: "impression",
        tick: 1,
      })
      .run();

    await runAnalyst(worldId, 24);
    const obs = db.select().from(banditObservations).all().filter((o) => o.postId === post.id);
    expect(obs).toHaveLength(1);

    await runAnalyst(worldId, 48);
    const obs2 = db.select().from(banditObservations).all().filter((o) => o.postId === post.id);
    expect(obs2).toHaveLength(1);
  });

  it("getArmDistributions returns last-20 rewards", () => {
    const { worldId } = buildTinyWorld("bandit-dist");
    const arm = db.select().from(banditArms).where(eq(banditArms.worldId, worldId)).all()[0]!;
    for (let i = 0; i < 3; i++) {
      db.insert(banditObservations)
        .values({ id: randomUUID(), armId: arm.id, postId: `p-${i}`, reward: 0.5, tick: i })
        .run();
    }
    const dist = getArmDistributions(worldId).find((d) => d.id === arm.id)!;
    expect(dist.recentRewards).toHaveLength(3);
    expect(dist.mean).toBeCloseTo(arm.alpha / (arm.alpha + arm.beta));
  });
});
