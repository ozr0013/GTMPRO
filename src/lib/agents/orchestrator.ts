import { db } from "@/lib/db/client";
import { banditArms, posts, proposals, settings, worlds } from "@/lib/db/schema";
import {
  CopywriterOutput,
  CriticOutput,
  StrategistOutput,
  type CopywriterOutputT,
  type CriticOutputT,
  type StrategistOutputT,
} from "@/lib/contracts";
import type { Archetype, PostPayload, PredictedEffect, TimeSlot } from "@/lib/types";
import { TIME_SLOTS } from "@/lib/types";
import { subRng } from "@/lib/rng";
import { sampleArm } from "@/lib/learning/bandit";
import { getActiveRules } from "@/lib/learning/playbook";
import { checkGuardrails } from "@/lib/learning/guardrails";
import { TICKS_PER_DAY } from "@/lib/sim/clock";
import { callAgent } from "./models";
import { SYSTEM, formatRules } from "./prompts";
import { logActivity } from "./log";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

export type Decision = "approve" | "reject" | "edit";

/** Earliest tick at or after `from` whose hour falls in the slot's window. */
export function nextTickForSlot(from: number, slot: TimeSlot): number {
  const hours = TIME_SLOTS[slot];
  for (let t = from; t < from + TICKS_PER_DAY * 2; t++) {
    if (hours.includes(t % TICKS_PER_DAY)) return t;
  }
  return from;
}

/**
 * One reasoning cycle: bandit picks the arm, strategist justifies the action against
 * the playbook, copywriter drafts, a different-family critic red-teams, guardrails
 * gate. Produces a pending proposal (Propose mode) or publishes directly (Autopilot,
 * non-sensitive only).
 *
 * Never throws: agent failures are quarantined into the activity log so the UI
 * always has something to show and the world stays advanceable.
 */
export async function runHeartbeat(worldId: string): Promise<{ proposalIds: string[] }> {
  const world = db.select().from(worlds).where(eq(worlds.id, worldId)).get()!;
  const config = db.select().from(settings).where(eq(settings.worldId, worldId)).get()!;
  const tick = world.simTick;
  const rules = getActiveRules(worldId);

  if (config.paused) {
    logActivity({
      worldId,
      tick,
      actor: "system",
      action: "heartbeat",
      status: "blocked",
      summary: "Heartbeat skipped — agent is paused",
    });
    return { proposalIds: [] };
  }

  const rng = subRng(world.seed, "heartbeat", tick);
  const arm = sampleArm(worldId, rng);
  if (!arm) return { proposalIds: [] };

  const armStats = db
    .select()
    .from(banditArms)
    .where(eq(banditArms.worldId, worldId))
    .all()
    .map((a) => `${a.archetype}/${a.timeSlot}: mean ${(a.alpha / (a.alpha + a.beta)).toFixed(2)} (n=${Math.round(a.alpha + a.beta - 4)})`)
    .join("\n");

  const strategy = await callAgent<StrategistOutputT>(
    "strategist",
    StrategistOutput,
    SYSTEM.strategist,
    [
      `Product: ${world.productDescription}`,
      `Sim time: tick ${tick}`,
      `Bandit sampled arm: ${arm.archetype}/${arm.timeSlot} — prefer it unless the playbook contradicts it.`,
      "",
      "Playbook:",
      formatRules(rules),
      "",
      "Bandit posteriors:",
      armStats,
    ].join("\n"),
    { worldSeed: world.seed, refId: `strategy-${tick}` },
  );

  if (!strategy.ok) {
    quarantine(worldId, tick, "strategist", strategy.error);
    return { proposalIds: [] };
  }

  logActivity({
    worldId,
    tick,
    actor: "strategist",
    action: "plan",
    status: "ok",
    summary: strategy.data.strategyNote,
    detail: { armId: arm.id, actions: strategy.data.actions.length },
  });

  const proposalIds: string[] = [];
  for (const action of strategy.data.actions) {
    // only `post` is wired end-to-end today; replies and DMs arrive with Track A's
    // DM simulation (A2) and Track B's community runner
    if (action.kind !== "post") continue;

    const draft = await callAgent<CopywriterOutputT>(
      "copywriter",
      CopywriterOutput,
      SYSTEM.copywriter,
      [
        `Topic: ${action.topic}`,
        `Angle: ${action.angle}`,
        `Archetype: ${arm.archetype}`,
        "",
        "Voice rules you must follow:",
        formatRules(rules.filter((r) => r.category === "voice")),
      ].join("\n"),
      { worldSeed: world.seed, refId: `copy-${tick}-${action.topic}` },
    );
    if (!draft.ok) {
      quarantine(worldId, tick, "copywriter", draft.error);
      continue;
    }

    const review = await callAgent<CriticOutputT>(
      "critic",
      CriticOutput,
      SYSTEM.critic,
      [`Caption: ${draft.data.caption}`, `Hashtags: ${draft.data.hashtags.join(" ")}`, `Topic: ${action.topic}`].join("\n"),
      { worldSeed: world.seed, refId: `critic-${tick}-${action.topic}` },
    );
    if (!review.ok) {
      quarantine(worldId, tick, "critic", review.error);
      continue;
    }

    if (review.data.verdict === "block") {
      logActivity({
        worldId,
        tick,
        actor: "critic",
        action: "review",
        status: "blocked",
        summary: `Blocked draft: ${review.data.issues.map((i) => i.note).join("; ")}`,
        detail: review.data.issues,
      });
      continue;
    }

    const caption = review.data.revisedCaption ?? draft.data.caption;
    logActivity({
      worldId,
      tick,
      actor: "critic",
      action: "review",
      status: "ok",
      summary:
        review.data.verdict === "revise"
          ? `Revised before proposing: ${review.data.issues.map((i) => i.note).join("; ")}`
          : "Passed review",
      detail: review.data.issues,
    });

    const scheduledTick = nextTickForSlot(tick + 1, arm.timeSlot as TimeSlot);
    const gate = checkGuardrails(worldId, {
      kind: "post",
      topic: action.topic,
      scheduledTick,
      riskClass: action.riskClass,
    });
    if (!gate.allowed) {
      logActivity({
        worldId,
        tick,
        actor: "system",
        action: "guardrail",
        status: "blocked",
        summary: `Guardrail blocked post: ${gate.reasons.join("; ")}`,
        detail: { reasons: gate.reasons },
      });
      continue;
    }

    const payload: PostPayload = {
      archetype: arm.archetype as Archetype,
      timeSlot: arm.timeSlot as TimeSlot,
      topic: action.topic,
      caption,
      hashtags: draft.data.hashtags,
      creativeBrief: draft.data.creativeBrief,
      scheduledTick,
    };
    const proposalId = randomUUID();
    // Autopilot still routes sensitive actions through a human (constraint: sensitive-always-gated)
    const autoApproved = !gate.requiresApproval;

    db.insert(proposals)
      .values({
        id: proposalId,
        worldId,
        kind: "post",
        status: autoApproved ? "auto_approved" : "pending",
        payload,
        reasoning: action.reasoning,
        evidence: {
          ruleIds: action.evidenceRuleIds,
          banditArmId: arm.id,
          signals: { armMean: arm.alpha / (arm.alpha + arm.beta) },
        },
        predictedEffect: action.predictedEffect satisfies PredictedEffect,
        riskClass: action.riskClass,
        createdTick: tick,
        decidedTick: autoApproved ? tick : null,
      })
      .run();
    proposalIds.push(proposalId);

    logActivity({
      worldId,
      tick,
      actor: "copywriter",
      action: "propose",
      status: "ok",
      summary: `${autoApproved ? "Auto-approved" : "Proposed"} ${arm.archetype} post on ${action.topic}`,
      refType: "proposal",
      refId: proposalId,
    });

    if (autoApproved) schedulePost(worldId, proposalId, tick);
  }

  return { proposalIds };
}

/** Human verdict on a pending proposal. The reason on a rejection is what the coach learns from. */
export function decideProposal(
  proposalId: string,
  decision: Decision,
  reason?: string,
  editedCaption?: string,
): void {
  const proposal = db.select().from(proposals).where(eq(proposals.id, proposalId)).get();
  if (!proposal || proposal.status !== "pending") return;
  const world = db.select().from(worlds).where(eq(worlds.id, proposal.worldId)).get()!;
  const tick = world.simTick;

  if (decision === "reject") {
    db.update(proposals)
      .set({ status: "rejected", humanReason: reason ?? "", decidedTick: tick })
      .where(eq(proposals.id, proposalId))
      .run();
    logActivity({
      worldId: proposal.worldId,
      tick,
      actor: "human",
      action: "reject",
      status: "ok",
      summary: `Rejected: ${reason ?? "(no reason)"}`,
      refType: "proposal",
      refId: proposalId,
    });
    return;
  }

  const payload = proposal.payload as PostPayload;
  if (decision === "edit" && editedCaption && editedCaption !== payload.caption) {
    db.update(proposals)
      .set({
        status: "edited_approved",
        payload: { ...payload, caption: editedCaption },
        humanReason: reason ?? "",
        humanEditDiff: { field: "caption", before: payload.caption, after: editedCaption },
        decidedTick: tick,
      })
      .where(eq(proposals.id, proposalId))
      .run();
    logActivity({
      worldId: proposal.worldId,
      tick,
      actor: "human",
      action: "edit",
      status: "ok",
      summary: `Edited caption before approving${reason ? `: ${reason}` : ""}`,
      refType: "proposal",
      refId: proposalId,
      detail: { before: payload.caption, after: editedCaption },
    });
  } else {
    db.update(proposals)
      .set({ status: "approved", humanReason: reason ?? null, decidedTick: tick })
      .where(eq(proposals.id, proposalId))
      .run();
    logActivity({
      worldId: proposal.worldId,
      tick,
      actor: "human",
      action: "approve",
      status: "ok",
      summary: "Approved as proposed",
      refType: "proposal",
      refId: proposalId,
    });
  }

  schedulePost(proposal.worldId, proposalId, tick);
}

/** Turns an approved proposal into a scheduled post. advanceTicks publishes it when due. */
export function schedulePost(worldId: string, proposalId: string, tick: number): string | null {
  const proposal = db.select().from(proposals).where(eq(proposals.id, proposalId)).get();
  if (!proposal) return null;
  const existing = db
    .select()
    .from(posts)
    .where(and(eq(posts.worldId, worldId), eq(posts.proposalId, proposalId)))
    .get();
  if (existing) return existing.id;

  const payload = proposal.payload as PostPayload;
  const evidence = proposal.evidence as { banditArmId?: string };
  const postId = randomUUID();

  db.insert(posts)
    .values({
      id: postId,
      worldId,
      authorType: "brand",
      proposalId,
      banditArmId: evidence.banditArmId ?? null,
      archetype: payload.archetype,
      topic: payload.topic,
      caption: payload.caption,
      hashtags: payload.hashtags,
      creativeBrief: payload.creativeBrief,
      scheduledTick: Math.max(payload.scheduledTick, tick),
      status: "scheduled",
    })
    .run();

  db.update(proposals).set({ status: "executed" }).where(eq(proposals.id, proposalId)).run();
  logActivity({
    worldId,
    tick,
    actor: "publisher",
    action: "schedule",
    status: "ok",
    summary: `Scheduled for tick ${Math.max(payload.scheduledTick, tick)} (${payload.timeSlot})`,
    refType: "post",
    refId: postId,
  });
  return postId;
}

function quarantine(worldId: string, tick: number, actor: "strategist" | "copywriter" | "critic", error: string) {
  logActivity({
    worldId,
    tick,
    actor,
    action: "structured_output",
    status: "quarantined",
    summary: `${actor} returned unusable output after retry — cycle abandoned, world unchanged`,
    detail: { error },
  });
}
