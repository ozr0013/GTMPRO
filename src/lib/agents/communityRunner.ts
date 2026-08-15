// Community runner: drafts brand replies for open DM threads awaiting an answer.
// First agent turn is always sensitive (gated); propose mode gates everything.

import { db } from "@/lib/db/client";
import { worlds, dmThreads, dmMessages, proposals } from "@/lib/db/schema";
import { callAgent } from "@/lib/agents/models";
import { SYSTEM } from "@/lib/agents/prompts";
import { CommunityOutput } from "@/lib/contracts";
import { checkGuardrails } from "@/lib/learning/guardrails";
import {
  executeDmReply,
  logActivity,
  ZERO_EFFECT,
  type DmReplyProposalPayload,
} from "@/lib/agents/orchestrator";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

export async function runCommunity(worldId: string, tick: number): Promise<void> {
  const world = db.select().from(worlds).where(eq(worlds.id, worldId)).get()!;
  const openThreads = db
    .select()
    .from(dmThreads)
    .where(and(eq(dmThreads.worldId, worldId), eq(dmThreads.status, "open")))
    .all()
    .filter((t) => t.turnCount < 3);

  for (const thread of openThreads) {
    const messages = db.select().from(dmMessages).where(eq(dmMessages.threadId, thread.id)).all();
    const last = messages[messages.length - 1];
    if (!last || last.sender !== "persona") continue;

    // Don't stack duplicate drafts while a human decision is still pending for this thread.
    const alreadyPending = db
      .select()
      .from(proposals)
      .where(
        and(
          eq(proposals.worldId, worldId),
          eq(proposals.kind, "dm_reply"),
          eq(proposals.status, "pending"),
        ),
      )
      .all()
      .some((p) => (p.payload as { threadId?: string }).threadId === thread.id);
    if (alreadyPending) continue;

    const transcript = messages.map((m) => `${m.sender}: ${m.text}`).join("\n");
    const reply = await callAgent(
      "community",
      CommunityOutput,
      SYSTEM.community,
      `DM thread with a prospect (agent turn ${thread.turnCount + 1} of 3):\n${transcript}\n\nWrite the brand's next reply and qualify the lead.`,
      { worldSeed: world.seed, refId: `dm-${thread.id}-${tick}` },
    );
    if (!reply.ok) {
      logActivity(worldId, tick, "system", "community_error", "error", `community agent failed: ${reply.error}`, {
        refType: "dm_thread",
        refId: thread.id,
      });
      continue;
    }

    const riskClass = thread.turnCount === 0 ? "sensitive" : "normal";
    const gate = checkGuardrails(worldId, { kind: "dm_reply", topic: "dm", scheduledTick: tick, riskClass });
    if (!gate.allowed) {
      logActivity(worldId, tick, "system", "guardrail_block", "blocked", gate.reasons.join("; "), {
        refType: "dm_thread",
        refId: thread.id,
      });
      continue;
    }

    const payload: DmReplyProposalPayload = {
      threadId: thread.id,
      text: reply.data.replyText,
      qualification: reply.data.qualification,
    };
    if (gate.requiresApproval) {
      const proposalId = randomUUID();
      db.insert(proposals)
        .values({
          id: proposalId,
          worldId,
          kind: "dm_reply",
          status: "pending",
          payload,
          reasoning: reply.data.rationale,
          evidence: { ruleIds: [], signals: [] },
          predictedEffect: ZERO_EFFECT,
          riskClass,
          createdTick: tick,
        })
        .run();
      logActivity(worldId, tick, "community", "propose_dm_reply", "pending", reply.data.rationale, {
        refType: "proposal",
        refId: proposalId,
      });
    } else {
      executeDmReply(worldId, payload, tick, "community");
    }
  }
}
