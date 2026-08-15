// Orchestrator: heartbeat (strategist → guardrails → copywriter → critic → proposal),
// human approval gate, and the publisher. Every step lands in activity_log.

import { db } from "@/lib/db/client";
import {
  worlds,
  settings,
  engagements,
  funnelEvents,
  dmThreads,
  dmMessages,
  proposals,
  posts,
  banditArms,
  activityLog,
} from "@/lib/db/schema";
import type { DmReplyPayload, PostPayload, PredictedEffect, TimeSlot } from "@/lib/types";
import { TIME_SLOTS } from "@/lib/types";
import { callAgent } from "@/lib/agents/models";
import { SYSTEM, formatRules } from "@/lib/agents/prompts";
import { StrategistOutput, CopywriterOutput, CriticOutput } from "@/lib/contracts";
import { getActiveRules } from "@/lib/learning/playbook";
import { checkGuardrails } from "@/lib/learning/guardrails";
import { sampleArm } from "@/lib/learning/bandit";
import { subRng } from "@/lib/rng";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

/** Shape stored in proposals.evidence for post proposals. */
export interface ProposalEvidence {
  ruleIds: string[];
  banditArmId?: string;
  signals: string[];
}

/** dm_reply proposals carry the community agent's qualification alongside the reply. */
export type DmReplyProposalPayload = DmReplyPayload & {
  qualification: "continue" | "meeting_booked" | "disqualified";
};

export const ZERO_EFFECT: PredictedEffect = {
  impressions: [0, 0],
  likes: [0, 0],
  linkClicks: [0, 0],
  signups: [0, 0],
};

export function logActivity(
  worldId: string,
  tick: number,
  actor: string,
  action: string,
  status: string,
  summary: string,
  ref?: { refType: string; refId: string },
  detail?: unknown,
): void {
  db.insert(activityLog)
    .values({
      id: randomUUID(),
      worldId,
      tick,
      actor,
      action,
      refType: ref?.refType,
      refId: ref?.refId,
      status,
      summary,
      detail,
      createdAt: new Date(),
    })
    .run();
}

/** Smallest tick T > currentTick whose hour-of-day falls in the given slot. */
export function nextSlotTick(currentTick: number, timeSlot: TimeSlot): number {
  const hours = TIME_SLOTS[timeSlot];
  let t = currentTick + 1;
  while (!hours.includes(t % 24)) t++;
  return t;
}

function insertQuarantinedProposal(
  worldId: string,
  tick: number,
  reasoning: string,
  error: string,
): void {
  const id = randomUUID();
  db.insert(proposals)
    .values({
      id,
      worldId,
      kind: "post",
      status: "quarantined",
      payload: {},
      reasoning,
      evidence: { error },
      predictedEffect: ZERO_EFFECT,
      riskClass: "normal",
      createdTick: tick,
    })
    .run();
  logActivity(
    worldId,
    tick,
    "system",
    "quarantine",
    "quarantined",
    `${reasoning}: ${error}`,
    { refType: "proposal", refId: id },
    { error },
  );
}

function buildHeartbeatContext(worldId: string, simTick: number): string {
  const rules = formatRules(getActiveRules(worldId));

  const arms = db.select().from(banditArms).where(eq(banditArms.worldId, worldId)).all();
  const armStats = arms
    .map(
      (a) =>
        `${a.archetype}/${a.timeSlot}: alpha=${a.alpha.toFixed(2)} beta=${a.beta.toFixed(2)} mean=${(
          a.alpha / (a.alpha + a.beta)
        ).toFixed(3)}`,
    )
    .join("\n");

  const since = simTick - 24;
  const recentEngagements = db
    .select()
    .from(engagements)
    .where(eq(engagements.worldId, worldId))
    .all()
    .filter((e) => e.tick > since);
  const recentFunnel = db
    .select()
    .from(funnelEvents)
    .where(eq(funnelEvents.worldId, worldId))
    .all()
    .filter((e) => e.tick > since);
  const countBy = (rows: { kind: string }[]) => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
    return [...counts.entries()].map(([k, n]) => `${k}=${n}`).join(" ") || "(none)";
  };

  const openComments = recentEngagements
    .filter((e) => e.kind === "comment" && e.commentText && e.commentText !== "[pending persona voice]")
    .map((e) => `- "${e.commentText}"`)
    .join("\n");

  const openThreads = db
    .select()
    .from(dmThreads)
    .where(and(eq(dmThreads.worldId, worldId), eq(dmThreads.status, "open")))
    .all();
  const dmSummary = openThreads
    .map((t) => {
      const msgs = db.select().from(dmMessages).where(eq(dmMessages.threadId, t.id)).all();
      const last = msgs[msgs.length - 1];
      return `- thread ${t.id} (turn ${t.turnCount}/3), last: ${last ? `${last.sender}: "${last.text}"` : "(empty)"}`;
    })
    .join("\n");

  return [
    "# Active playbook rules",
    rules,
    "# Bandit arm stats (archetype/timeSlot)",
    armStats,
    "# Last 24 ticks — engagement counts",
    countBy(recentEngagements),
    "# Last 24 ticks — funnel counts",
    countBy(recentFunnel),
    "# Unanswered comments",
    openComments || "(none)",
    "# Open DM threads",
    dmSummary || "(none)",
  ].join("\n\n");
}

export async function runHeartbeat(worldId: string): Promise<{ proposalIds: string[] }> {
  const world = db.select().from(worlds).where(eq(worlds.id, worldId)).get()!;
  const worldSettings = db.select().from(settings).where(eq(settings.worldId, worldId)).get()!;
  const tick = world.simTick;

  if (worldSettings.paused) {
    logActivity(worldId, tick, "system", "heartbeat", "skipped", "skipped: paused");
    return { proposalIds: [] };
  }

  const context = buildHeartbeatContext(worldId, tick);
  const strat = await callAgent("strategist", StrategistOutput, SYSTEM.strategist, context, {
    worldSeed: world.seed,
    refId: `hb-${tick}`,
  });
  if (!strat.ok) {
    insertQuarantinedProposal(worldId, tick, "strategist failure", strat.error);
    return { proposalIds: [] };
  }

  logActivity(worldId, tick, "strategist", "propose", "ok", strat.data.strategyNote);

  const proposalIds: string[] = [];
  for (const [actionIndex, action] of strat.data.actions.entries()) {
    const timeSlot: TimeSlot = action.timeSlot ?? "morning";
    const scheduledTick = nextSlotTick(tick, timeSlot);

    const gate = checkGuardrails(worldId, {
      kind: action.kind,
      topic: action.topic,
      scheduledTick,
      riskClass: action.riskClass,
    });
    if (!gate.allowed) {
      logActivity(worldId, tick, "system", "guardrail_block", "blocked", gate.reasons.join("; "));
      continue;
    }

    // Heartbeat only drives the post pipeline; DM replies are the community
    // runner's job and standalone comment replies are out of scope for Task 5.
    if (action.kind !== "post") {
      logActivity(
        worldId,
        tick,
        "system",
        "skip_action",
        "skipped",
        `unsupported heartbeat action kind: ${action.kind}`,
      );
      continue;
    }

    const voiceRules = formatRules(getActiveRules(worldId).filter((r) => r.category === "voice"));
    const copy = await callAgent(
      "copywriter",
      CopywriterOutput,
      SYSTEM.copywriter,
      `Angle: ${action.angle}\nTopic: ${action.topic}\nArchetype: ${action.archetype ?? "education"}\n\nVoice rules:\n${voiceRules || "(none)"}`,
      { worldSeed: world.seed, refId: `cw-${tick}-${actionIndex}` },
    );
    if (!copy.ok) {
      insertQuarantinedProposal(worldId, tick, "copywriter failure", copy.error);
      continue;
    }
    logActivity(worldId, tick, "copywriter", "draft", "ok", copy.data.caption.slice(0, 120));

    const critic = await callAgent(
      "critic",
      CriticOutput,
      SYSTEM.critic,
      `Drafted caption:\n${copy.data.caption}\n\nHashtags: ${copy.data.hashtags.join(" ")}\nTopic: ${action.topic}`,
      { worldSeed: world.seed, refId: `cr-${tick}-${actionIndex}` },
    );
    if (!critic.ok) {
      insertQuarantinedProposal(worldId, tick, "critic failure", critic.error);
      continue;
    }
    const issueSummary = critic.data.issues.map((i) => `${i.severity}/${i.kind}: ${i.note}`).join("; ");
    logActivity(
      worldId,
      tick,
      "critic",
      "review",
      critic.data.verdict,
      issueSummary || `verdict: ${critic.data.verdict}`,
    );
    if (critic.data.verdict === "block") continue;
    const caption =
      critic.data.verdict === "revise" && critic.data.revisedCaption
        ? critic.data.revisedCaption
        : copy.data.caption;

    const arm = sampleArm(worldId, subRng(world.seed, "arm", tick, actionIndex));

    const payload: PostPayload = {
      archetype: action.archetype ?? "education",
      timeSlot,
      topic: action.topic,
      caption,
      hashtags: copy.data.hashtags,
      creativeBrief: copy.data.creativeBrief,
      scheduledTick,
    };
    const evidence: ProposalEvidence = {
      ruleIds: action.evidenceRuleIds,
      banditArmId: arm.id,
      signals: [],
    };
    const proposalId = randomUUID();
    const status = gate.requiresApproval ? "pending" : "auto_approved";
    db.insert(proposals)
      .values({
        id: proposalId,
        worldId,
        kind: action.kind,
        status,
        payload,
        reasoning: action.reasoning,
        evidence,
        predictedEffect: action.predictedEffect,
        riskClass: action.riskClass,
        createdTick: tick,
      })
      .run();
    proposalIds.push(proposalId);

    if (status === "auto_approved") publishProposal(proposalId);
  }

  return { proposalIds };
}

export async function decideProposal(
  proposalId: string,
  decision: "approve" | "reject" | "edit",
  opts?: { reason?: string; editedPayload?: PostPayload },
): Promise<void> {
  const proposal = db.select().from(proposals).where(eq(proposals.id, proposalId)).get()!;
  const world = db.select().from(worlds).where(eq(worlds.id, proposal.worldId)).get()!;
  const tick = world.simTick;
  const ref = { refType: "proposal", refId: proposalId };

  if (decision === "reject") {
    db.update(proposals)
      .set({ status: "rejected", humanReason: opts?.reason, decidedTick: tick })
      .where(eq(proposals.id, proposalId))
      .run();
    logActivity(
      proposal.worldId,
      tick,
      "human",
      "reject",
      "rejected",
      opts?.reason ?? "rejected without reason",
      ref,
    );
    return;
  }

  if (decision === "approve") {
    db.update(proposals)
      .set({ status: "approved", decidedTick: tick })
      .where(eq(proposals.id, proposalId))
      .run();
    logActivity(proposal.worldId, tick, "human", "approve", "approved", "proposal approved", ref);
  } else {
    const before = proposal.payload as PostPayload;
    const after = opts?.editedPayload ?? before;
    db.update(proposals)
      .set({
        status: "edited_approved",
        humanEditDiff: { before, after },
        payload: after,
        decidedTick: tick,
      })
      .where(eq(proposals.id, proposalId))
      .run();
    logActivity(
      proposal.worldId,
      tick,
      "human",
      "edit",
      "edited_approved",
      "proposal edited and approved",
      ref,
    );
  }

  publishProposal(proposalId);
}

/** Turn an approved/auto-approved proposal into its side effect (post row or DM reply). */
function publishProposal(proposalId: string): void {
  const proposal = db.select().from(proposals).where(eq(proposals.id, proposalId)).get()!;
  const world = db.select().from(worlds).where(eq(worlds.id, proposal.worldId)).get()!;
  const tick = world.simTick;

  if (proposal.kind === "post") {
    const payload = proposal.payload as PostPayload;
    const evidence = proposal.evidence as ProposalEvidence;
    const postId = randomUUID();
    db.insert(posts)
      .values({
        id: postId,
        worldId: proposal.worldId,
        authorType: "brand",
        proposalId: proposal.id,
        banditArmId: evidence.banditArmId,
        archetype: payload.archetype,
        topic: payload.topic,
        caption: payload.caption,
        hashtags: payload.hashtags,
        creativeBrief: payload.creativeBrief,
        scheduledTick: payload.scheduledTick,
        status: "scheduled",
      })
      .run();
    logActivity(
      proposal.worldId,
      tick,
      "publisher",
      "schedule_post",
      "scheduled",
      `post scheduled for tick ${payload.scheduledTick}: ${payload.caption.slice(0, 80)}`,
      { refType: "post", refId: postId },
    );
  } else if (proposal.kind === "dm_reply") {
    const payload = proposal.payload as DmReplyProposalPayload;
    executeDmReply(proposal.worldId, payload, tick, "publisher");
  }
}

/** Shared effect of sending a brand DM reply (used by publisher and autopilot community). */
export function executeDmReply(
  worldId: string,
  payload: DmReplyProposalPayload,
  tick: number,
  actor: "publisher" | "community",
): void {
  const thread = db.select().from(dmThreads).where(eq(dmThreads.id, payload.threadId)).get()!;
  db.insert(dmMessages)
    .values({ id: randomUUID(), threadId: thread.id, sender: "agent", text: payload.text, tick })
    .run();
  db.update(dmThreads)
    .set({ turnCount: thread.turnCount + 1 })
    .where(eq(dmThreads.id, thread.id))
    .run();

  if (payload.qualification === "meeting_booked" || payload.qualification === "disqualified") {
    db.update(dmThreads)
      .set({ status: payload.qualification === "meeting_booked" ? "qualified" : "disqualified" })
      .where(eq(dmThreads.id, thread.id))
      .run();
    db.insert(funnelEvents)
      .values({
        id: randomUUID(),
        worldId,
        personaId: thread.personaId,
        kind: payload.qualification,
        tick,
      })
      .run();
  }

  logActivity(
    worldId,
    tick,
    actor,
    "dm_reply",
    "sent",
    `DM reply sent (${payload.qualification})`,
    { refType: "dm_thread", refId: thread.id },
  );
}
