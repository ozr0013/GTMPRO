import { describe, it, expect } from "vitest";
import { buildTinyWorld } from "./fixtures/world";
import { db } from "@/lib/db/client";
import { dmMessages, dmThreads, personas, posts, proposals, settings } from "@/lib/db/schema";
import { decideProposal, expireStaleProposals, runHeartbeat } from "@/lib/agents/orchestrator";
import { runCommunityPass } from "@/lib/agents/communityRunner";
import { spendImageBudget } from "@/lib/learning/guardrails";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

describe("autopilot, budgets, kill switch", () => {
  it("autopilot auto-publishes normal posts", async () => {
    const { worldId } = buildTinyWorld("ap-auto");
    db.update(settings).set({ mode: "autopilot" }).where(eq(settings.worldId, worldId)).run();
    const { proposalIds } = await runHeartbeat(worldId);
    expect(proposalIds.length).toBeGreaterThanOrEqual(1);
    const p = db.select().from(proposals).where(eq(proposals.id, proposalIds[0])).get()!;
    expect(p.status).toBe("executed");
    expect(db.select().from(posts).where(eq(posts.worldId, worldId)).all().length).toBeGreaterThanOrEqual(1);
  });

  it("sensitive first-touch DM stays pending in autopilot", async () => {
    const { worldId } = buildTinyWorld("ap-sensitive");
    db.update(settings).set({ mode: "autopilot" }).where(eq(settings.worldId, worldId)).run();
    const persona = db.select().from(personas).where(eq(personas.worldId, worldId)).all()[0]!;
    const threadId = randomUUID();
    db.insert(dmThreads)
      .values({ id: threadId, worldId, personaId: persona.id, status: "open", turnCount: 0, createdTick: 0 })
      .run();
    db.insert(dmMessages)
      .values({ id: randomUUID(), threadId, sender: "persona", text: "Can we hop on a call?", tick: 0 })
      .run();

    const { proposalIds } = await runCommunityPass(worldId);
    expect(proposalIds.length).toBe(1);
    const p = db.select().from(proposals).where(eq(proposals.id, proposalIds[0])).get()!;
    expect(p.riskClass).toBe("sensitive");
    expect(p.status).toBe("pending");
  });

  it("pause blocks publish after approval", async () => {
    const { worldId } = buildTinyWorld("ap-pause-pub");
    const { proposalIds } = await runHeartbeat(worldId);
    db.update(settings).set({ paused: true }).where(eq(settings.worldId, worldId)).run();
    await decideProposal(proposalIds[0], "approve");
    expect(db.select().from(posts).where(eq(posts.worldId, worldId)).all()).toHaveLength(0);
    const p = db.select().from(proposals).where(eq(proposals.id, proposalIds[0])).get()!;
    expect(p.status).toBe("approved");
  });

  it("posts/day cap blocks a fourth autopilot post", async () => {
    const { worldId } = buildTinyWorld("ap-cap");
    db.update(settings).set({ mode: "autopilot" }).where(eq(settings.worldId, worldId)).run();
    for (let i = 0; i < 3; i++) {
      db.insert(posts)
        .values({
          id: randomUUID(),
          worldId,
          authorType: "brand",
          archetype: "meme",
          topic: "t",
          caption: "c",
          hashtags: [],
          creativeBrief: "b",
          scheduledTick: 8,
          publishedTick: 8,
          status: "published",
        })
        .run();
    }
    const { proposalIds } = await runHeartbeat(worldId);
    const livePosts = db
      .select()
      .from(proposals)
      .where(eq(proposals.worldId, worldId))
      .all()
      .filter((p) => p.kind === "post" && p.status === "executed");
    expect(proposalIds.filter((id) => livePosts.some((p) => p.id === id))).toHaveLength(0);
  });

  it("image budget 0 refuses spend; positive budget decrements", () => {
    const { worldId } = buildTinyWorld("ap-img");
    db.update(settings).set({ imageBudget: 0 }).where(eq(settings.worldId, worldId)).run();
    expect(spendImageBudget(worldId).ok).toBe(false);
    db.update(settings).set({ imageBudget: 2 }).where(eq(settings.worldId, worldId)).run();
    expect(spendImageBudget(worldId).ok).toBe(true);
    expect(db.select().from(settings).where(eq(settings.worldId, worldId)).get()!.imageBudget).toBe(1);
  });

  it("expireStaleProposals marks pending older than 48 ticks", async () => {
    const { worldId } = buildTinyWorld("ap-expire");
    const { proposalIds } = await runHeartbeat(worldId);
    expireStaleProposals(worldId, 47);
    expect(db.select().from(proposals).where(eq(proposals.id, proposalIds[0])).get()!.status).toBe("pending");
    expireStaleProposals(worldId, 48);
    expect(db.select().from(proposals).where(eq(proposals.id, proposalIds[0])).get()!.status).toBe("expired");
  });
});
