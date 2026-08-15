import { describe, it, expect } from "vitest";
import { buildTinyWorld } from "./fixtures/world";
import { db } from "@/lib/db/client";
import {
  banditArms,
  banditObservations,
  dmMessages,
  dmThreads,
  engagements,
  funnelEvents,
  outcomeReports,
  personas,
  playbookVersions,
  posts,
  proposals,
} from "@/lib/db/schema";
import { decideProposal, runHeartbeat } from "@/lib/agents/orchestrator";
import { runAnalyst } from "@/lib/agents/analystRunner";
import { runCoach } from "@/lib/agents/coachRunner";
import { runCommunityPass } from "@/lib/agents/communityRunner";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { PredictedEffect } from "@/lib/types";

const predicted: PredictedEffect = {
  impressions: [10, 20],
  likes: [2, 5],
  linkClicks: [0, 2],
  signups: [0, 1],
};

function seedPublishedPost(worldId: string, opts?: { banditArmId?: string; proposalId?: string }) {
  const proposalId = opts?.proposalId ?? randomUUID();
  if (!opts?.proposalId) {
    db.insert(proposals)
      .values({
        id: proposalId,
        worldId,
        kind: "post",
        status: "executed",
        payload: {
          archetype: "education",
          timeSlot: "morning",
          topic: "brewing-science",
          caption: "seed",
          hashtags: [],
          creativeBrief: "b",
          scheduledTick: 0,
        },
        reasoning: "seed",
        evidence: { ruleIds: ["timing-1"], banditArmId: opts?.banditArmId },
        predictedEffect: predicted,
        riskClass: "normal",
        createdTick: 0,
        decidedTick: 0,
      })
      .run();
  }
  const postId = randomUUID();
  db.insert(posts)
    .values({
      id: postId,
      worldId,
      authorType: "brand",
      proposalId,
      banditArmId: opts?.banditArmId ?? null,
      archetype: "education",
      topic: "brewing-science",
      caption: "How water temp changes extraction",
      hashtags: ["#coffee"],
      creativeBrief: "diagram",
      scheduledTick: 0,
      publishedTick: 0,
      status: "published",
    })
    .run();
  const persona = db.select().from(personas).where(eq(personas.worldId, worldId)).all()[0]!;
  for (const kind of ["impression", "like"] as const) {
    db.insert(engagements)
      .values({
        id: randomUUID(),
        worldId,
        postId,
        personaId: persona.id,
        kind,
        tick: 1,
      })
      .run();
  }
  return { postId, proposalId };
}

describe("analyst / coach / community runners", () => {
  it("analyst writes an outcome report and records a bandit reward once", async () => {
    const { worldId } = buildTinyWorld("runner-analyst");
    const arm = db.select().from(banditArms).where(eq(banditArms.worldId, worldId)).all()[0]!;
    const { postId } = seedPublishedPost(worldId, { banditArmId: arm.id });
    const first = await runAnalyst(worldId, 24);
    expect(first.reportIds.length).toBe(1);
    expect(db.select().from(outcomeReports).where(eq(outcomeReports.worldId, worldId)).all()).toHaveLength(1);
    const second = await runAnalyst(worldId, 48);
    expect(second.reportIds).toHaveLength(0);
    const obs = db.select().from(outcomeReports).where(eq(outcomeReports.postId, postId)).all();
    expect(obs).toHaveLength(1);
    expect(db.select().from(banditObservations).all().filter((o) => o.postId === postId)).toHaveLength(1);
  });

  it("coach bumps the playbook version after a rejection", async () => {
    const { worldId } = buildTinyWorld("runner-coach");
    const { proposalIds } = await runHeartbeat(worldId);
    await decideProposal(proposalIds[0], "reject", {
      reason: "Too salesy; we never lead with product pushes.",
    });
    const before = db
      .select()
      .from(playbookVersions)
      .where(eq(playbookVersions.worldId, worldId))
      .all()
      .sort((a, b) => b.version - a.version)[0]!;
    const { versionId } = await runCoach(worldId, 24);
    expect(versionId).toBeTruthy();
    const after = db
      .select()
      .from(playbookVersions)
      .where(eq(playbookVersions.worldId, worldId))
      .all()
      .sort((a, b) => b.version - a.version)[0]!;
    expect(after.version).toBeGreaterThan(before.version);
  });

  it("community drafts a sensitive first-touch DM proposal", async () => {
    const { worldId } = buildTinyWorld("runner-community");
    const persona = db.select().from(personas).where(eq(personas.worldId, worldId)).all()[0]!;
    const threadId = randomUUID();
    db.insert(dmThreads)
      .values({
        id: threadId,
        worldId,
        personaId: persona.id,
        status: "open",
        turnCount: 0,
        createdTick: 0,
      })
      .run();
    db.insert(dmMessages)
      .values({
        id: randomUUID(),
        threadId,
        sender: "persona",
        text: "Is this concentrate shelf-stable?",
        tick: 0,
      })
      .run();
    db.insert(funnelEvents)
      .values({
        id: randomUUID(),
        worldId,
        personaId: persona.id,
        kind: "dm_started",
        tick: 0,
      })
      .run();

    const { proposalIds } = await runCommunityPass(worldId);
    expect(proposalIds.length).toBe(1);
    const p = db.select().from(proposals).where(eq(proposals.id, proposalIds[0])).get()!;
    expect(p.kind).toBe("dm_reply");
    expect(p.status).toBe("pending");
    expect(p.riskClass).toBe("sensitive");
  });
});
