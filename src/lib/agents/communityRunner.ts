import { db } from "@/lib/db/client";
import { dmMessages, dmThreads, personas, proposals, settings, worlds } from "@/lib/db/schema";
import { callAgent } from "@/lib/agents/models";
import { SYSTEM } from "@/lib/agents/prompts";
import { logActivity } from "@/lib/agents/log";
import { publishProposal } from "@/lib/agents/publisher";
import { CommunityOutput } from "@/lib/contracts";
import { checkGuardrails } from "@/lib/learning/guardrails";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

const EMPTY_EFFECT = {
  impressions: [0, 0] as [number, number],
  likes: [0, 0] as [number, number],
  linkClicks: [0, 0] as [number, number],
  signups: [0, 0] as [number, number],
};

/**
 * Open threads with turnCount < 3 and an unanswered persona message → community draft.
 * First agent turn is always sensitive (human-gated even in autopilot).
 */
export async function runCommunityPass(worldId: string): Promise<{ proposalIds: string[] }> {
  const world = db.select().from(worlds).where(eq(worlds.id, worldId)).get()!;
  const s = db.select().from(settings).where(eq(settings.worldId, worldId)).get()!;
  if (s.paused) return { proposalIds: [] };

  const threads = db
    .select()
    .from(dmThreads)
    .where(and(eq(dmThreads.worldId, worldId), eq(dmThreads.status, "open")))
    .all()
    .filter((t) => t.turnCount < 3);

  const proposalIds: string[] = [];

  for (const thread of threads) {
    const msgs = db.select().from(dmMessages).where(eq(dmMessages.threadId, thread.id)).all();
    if (msgs.length === 0) continue;
    const last = [...msgs].sort((a, b) => a.tick - b.tick)[msgs.length - 1];
    if (last.sender !== "persona") continue;

    const agentTurns = msgs.filter((m) => m.sender === "agent").length;
    const firstTouch = agentTurns === 0;
    const riskClass = firstTouch ? "sensitive" : "normal";

    // refId keyed on stable identifiers (persona handle + turn), never row UUIDs —
    // mock-mode rng derives from refId, so UUID keys break same-seed determinism.
    const persona = db.select().from(personas).where(eq(personas.id, thread.personaId)).get()!;
    const community = await callAgent(
      "community",
      CommunityOutput,
      SYSTEM.community,
      `DM with @${persona.handle}, turnCount=${thread.turnCount}, firstTouch=${firstTouch}. Last persona message: ${last.text}`,
      { worldSeed: world.seed, refId: `community-${persona.handle}-${thread.turnCount}` },
    );
    if (!community.ok) {
      const qid = randomUUID();
      db.insert(proposals)
        .values({
          id: qid,
          worldId,
          kind: "dm_reply",
          status: "quarantined",
          payload: { error: community.error },
          reasoning: community.error,
          evidence: { ruleIds: [], signals: ["community"] },
          predictedEffect: EMPTY_EFFECT,
          riskClass,
          createdTick: world.simTick,
        })
        .run();
      logActivity({
        worldId,
        tick: world.simTick,
        actor: "community",
        action: "dm_reply",
        status: "quarantined",
        summary: community.error,
        refType: "proposal",
        refId: qid,
      });
      continue;
    }

    const gate = checkGuardrails(worldId, {
      kind: "dm_reply",
      topic: "dm",
      scheduledTick: world.simTick,
      riskClass,
    });
    if (!gate.allowed) {
      logActivity({
        worldId,
        tick: world.simTick,
        actor: "community",
        action: "dm_reply",
        status: "blocked",
        summary: gate.reasons.join("; "),
        refType: "thread",
        refId: thread.id,
      });
      continue;
    }

    const id = randomUUID();
    const status = gate.requiresApproval ? "pending" : "auto_approved";
    db.insert(proposals)
      .values({
        id,
        worldId,
        kind: "dm_reply",
        status,
        payload: {
          threadId: thread.id,
          text: community.data.replyText,
          qualification: community.data.qualification,
        },
        reasoning: community.data.rationale,
        evidence: { ruleIds: [], signals: ["community"] },
        predictedEffect: EMPTY_EFFECT,
        riskClass,
        createdTick: world.simTick,
      })
      .run();
    logActivity({
      worldId,
      tick: world.simTick,
      actor: "community",
      action: "dm_reply",
      status,
      summary: community.data.rationale,
      refType: "proposal",
      refId: id,
    });
    if (status === "auto_approved") publishProposal(id);
    proposalIds.push(id);
  }

  return { proposalIds };
}
