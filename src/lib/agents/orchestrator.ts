import { db } from "@/lib/db/client";
import {
  dmThreads,
  engagements,
  funnelEvents,
  proposals,
  settings,
  worlds,
} from "@/lib/db/schema";
import type {
  Archetype,
  DmReplyPayload,
  PostPayload,
  PredictedEffect,
  ReplyPayload,
  TimeSlot,
  WorldConfig,
} from "@/lib/types";
import { TIME_SLOTS } from "@/lib/types";
import { callAgent } from "@/lib/agents/models";
import { SYSTEM, formatRules } from "@/lib/agents/prompts";
import { logActivity } from "@/lib/agents/log";
import { nextTickForSlot, publishProposal } from "@/lib/agents/publisher";
import { runCommunityPass } from "@/lib/agents/communityRunner";
import {
  CopywriterOutput,
  CriticOutput,
  StrategistOutput,
  type StrategistOutputT,
} from "@/lib/contracts";
import { getArmStats, type ArmStats } from "@/lib/learning/bandit";
import { rollingHitRate, calibrationNote } from "@/lib/learning/calibration";
import { dreamCandidates, dreamFor, renderDreamPreview, type DreamRanking } from "@/lib/learning/dreamer";
import { checkGuardrails } from "@/lib/learning/guardrails";
import { getActiveRules, rollbackTo } from "@/lib/learning/playbook";
import { formatRulePerformance, getRulePerformance } from "@/lib/learning/ruleEvidence";
import { pick, subRng, type Rng } from "@/lib/rng";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

export { publishProposal, expireStaleProposals, nextTickForSlot } from "@/lib/agents/publisher";

const EMPTY_EFFECT = {
  impressions: [0, 0] as [number, number],
  likes: [0, 0] as [number, number],
  linkClicks: [0, 0] as [number, number],
  signups: [0, 0] as [number, number],
};

type StratAction = StrategistOutputT["actions"][number];

function insertQuarantined(worldId: string, tick: number, error: string, kind: "post" | "reply" | "dm_reply" = "post"): string {
  const id = randomUUID();
  db.insert(proposals)
    .values({
      id,
      worldId,
      kind,
      status: "quarantined",
      payload: { error },
      reasoning: error,
      evidence: { ruleIds: [], signals: [] },
      predictedEffect: EMPTY_EFFECT,
      riskClass: "normal",
      createdTick: tick,
    })
    .run();
  logActivity({
    worldId,
    tick,
    actor: "system",
    action: "quarantine",
    status: "quarantined",
    summary: error,
    refType: "proposal",
    refId: id,
    detail: { error },
  });
  return id;
}

function renderContext(
  worldId: string,
  tick: number,
  rules: { ruleKey: string; category: string; text: string }[],
  armStats: ArmStats[],
  hitRate: number | null,
  pillars: string[],
  rulePerformance: string,
  dreamPreview: string,
): string {
  const since = Math.max(0, tick - 24);
  const engs = db
    .select()
    .from(engagements)
    .where(eq(engagements.worldId, worldId))
    .all()
    .filter((e) => e.tick >= since);
  const funnel = db
    .select()
    .from(funnelEvents)
    .where(eq(funnelEvents.worldId, worldId))
    .all()
    .filter((e) => e.tick >= since);
  const countKind = (rows: { kind: string }[], kind: string) => rows.filter((r) => r.kind === kind).length;
  const comments = engs.filter((e) => e.kind === "comment").slice(-10);
  const threads = db.select().from(dmThreads).where(eq(dmThreads.worldId, worldId)).all();

  const arms = armStats
    .map(
      (a) =>
        `- ${a.archetype}/${a.timeSlot} id=${a.id} mean=${a.mean.toFixed(3)} n=${a.n} thompson=${a.sample.toFixed(3)}`,
    )
    .join("\n");

  return [
    `Sim tick: ${tick} (hour ${tick % 24}, slot hours morning=${TIME_SLOTS.morning.join(",")})`,
    `Calibration: ${calibrationNote(hitRate)}`,
    // personas' interests are drawn from these, so an off-list topic reaches
    // people who do not care and the funnel goes quiet
    `Content pillars — "topic" MUST be one of: ${pillars.join(", ") || "(none configured)"}`,
    "",
    "Playbook rules:",
    formatRules(rules) || "(none)",
    "",
    // measured track record per rule, so citations favour what has actually worked
    "Rule track record (from scored posts that cited each rule):",
    rulePerformance,
    "",
    "Bandit arms (cite banditArmId on post actions):",
    arms,
    "",
    // the sandbox dream: candidates ranked against the agent's LEARNED model
    // (posterior means x observed engagement rates) — never the hidden config
    "Dream preview — your learned model ranks these candidates (top 5):",
    dreamPreview,
    "",
    `Last 24 ticks: impressions=${countKind(engs, "impression")} likes=${countKind(engs, "like")} comments=${countKind(engs, "comment")} clicks=${countKind(funnel, "link_click")} signups=${countKind(funnel, "signup")} dms=${countKind(funnel, "dm_started")} meetings=${countKind(funnel, "meeting_booked")}`,
    "",
    "Recent comments:",
    comments.map((c) => `- ${c.id}: ${c.commentText ?? ""}`).join("\n") || "(none)",
    "",
    "Open DM threads:",
    threads
      .filter((t) => t.status === "open")
      .map((t) => `- ${t.id} persona=${t.personaId} turns=${t.turnCount}`)
      .join("\n") || "(none)",
  ].join("\n");
}

/**
 * A persona only engages when the post's topic is in their `interests`, and those
 * interests are drawn from the world's content pillars. A topic outside that list
 * therefore reaches people and lands with nobody — the post looks fine and the
 * funnel is silently dead. Snap off-list topics back onto the pillars and say so
 * in the activity log rather than failing quietly.
 */
function groundTopic(
  worldId: string,
  tick: number,
  action: StratAction,
  pillars: string[],
  rng: Rng,
): StratAction {
  if (action.kind !== "post" || pillars.length === 0 || pillars.includes(action.topic)) {
    return action;
  }
  const topic = pick(rng, pillars);
  logActivity({
    worldId,
    tick,
    actor: "strategist",
    action: "topic_snap",
    status: "ok",
    summary: `Topic "${action.topic}" is not a content pillar — using "${topic}"`,
    detail: { requested: action.topic, used: topic, pillars },
  });
  return { ...action, topic };
}

/**
 * Counts can't be negative and a range can't run backwards, but the contract only
 * types these as numbers — so a model is free to predict `impressions: [-10, 30]`
 * and pass validation. qwen3:14b does exactly that. Left alone it corrupts three
 * things downstream: the range renders as "-10–30" in approvals, `computeReward`
 * averages the bounds so a negative floor drags the bandit's reward, and
 * calibration counts a "hit" for any actual inside an impossibly wide band.
 *
 * Clamping beats rejecting here: the prediction is directionally fine and
 * quarantining a whole proposal over one bad floor is disproportionate.
 */
function sanitizePrediction(effect: PredictedEffect): PredictedEffect {
  const fix = ([lo, hi]: [number, number]): [number, number] => {
    const a = Math.max(0, Math.round(lo));
    const b = Math.max(0, Math.round(hi));
    return a <= b ? [a, b] : [b, a];
  };
  return {
    impressions: fix(effect.impressions),
    likes: fix(effect.likes),
    linkClicks: fix(effect.linkClicks),
    signups: fix(effect.signups),
  };
}

function resolveArmId(action: StratAction, armStats: ArmStats[]): string | undefined {
  if (action.banditArmId) return action.banditArmId;
  const archetype = (action.archetype ?? "education") as Archetype;
  const timeSlot = (action.timeSlot ?? "morning") as TimeSlot;
  return armStats.find((a) => a.archetype === archetype && a.timeSlot === timeSlot)?.id;
}

async function processAction(
  world: { id: string; seed: string; simTick: number },
  action: StratAction,
  armStats: ArmStats[],
  dream: DreamRanking,
): Promise<string | null> {
  const slot = (action.timeSlot ?? "morning") as TimeSlot;
  const scheduledTick = nextTickForSlot(world.simTick, slot);
  const gate = checkGuardrails(world.id, {
    kind: action.kind,
    topic: action.topic,
    scheduledTick,
    riskClass: action.riskClass,
  });
  if (!gate.allowed) {
    logActivity({
      worldId: world.id,
      tick: world.simTick,
      actor: "strategist",
      action: "propose",
      status: "blocked",
      summary: gate.reasons.join("; "),
      detail: { reasons: gate.reasons, kind: action.kind },
    });
    return null;
  }

  let payload: PostPayload | DmReplyPayload | ReplyPayload;
  const banditArmId = action.kind === "post" ? resolveArmId(action, armStats) : undefined;

  if (action.kind === "post") {
    const copy = await callAgent(
      "copywriter",
      CopywriterOutput,
      SYSTEM.copywriter,
      `Angle: ${action.angle}\nTopic: ${action.topic}\nArchetype: ${action.archetype ?? "education"}\nRules:\n${formatRules(getActiveRules(world.id))}`,
      { worldSeed: world.seed, refId: `copy-${world.simTick}-${action.topic}` },
    );
    if (!copy.ok) return insertQuarantined(world.id, world.simTick, copy.error);
    logActivity({
      worldId: world.id,
      tick: world.simTick,
      actor: "copywriter",
      action: "draft",
      status: "ok",
      summary: copy.data.caption.slice(0, 160),
    });

    const criticUser = `Caption: ${copy.data.caption}\nHashtags: ${copy.data.hashtags.join(" ")}\nBrief: ${copy.data.creativeBrief}`;
    const critic = await callAgent("critic", CriticOutput, SYSTEM.critic, criticUser, {
      worldSeed: world.seed,
      refId: `critic-${world.simTick}-${action.topic}`,
    });
    if (!critic.ok) return insertQuarantined(world.id, world.simTick, critic.error);
    if (critic.data.verdict === "block") {
      logActivity({
        worldId: world.id,
        tick: world.simTick,
        actor: "critic",
        action: "review",
        status: "blocked",
        summary: critic.data.issues.map((i) => i.note).join("; ") || "blocked",
        detail: critic.data,
      });
      return null;
    }
    logActivity({
      worldId: world.id,
      tick: world.simTick,
      actor: "critic",
      action: "review",
      status: critic.data.verdict,
      summary: critic.data.verdict,
    });
    const caption =
      critic.data.verdict === "revise" && critic.data.revisedCaption
        ? critic.data.revisedCaption
        : copy.data.caption;
    payload = {
      archetype: (action.archetype ?? "education") as Archetype,
      timeSlot: slot,
      topic: action.topic,
      caption,
      hashtags: copy.data.hashtags,
      creativeBrief: copy.data.creativeBrief,
      scheduledTick,
    };
  } else if (action.kind === "dm_reply") {
    // Small live models occasionally invent DM actions with no matching open
    // thread. Publishing one silently no-ops after approval (the publisher
    // skips unknown threads) — an approvable card that does nothing. Drop it
    // at proposal time and say so in the trail.
    const threadId = action.threadId ?? "";
    const thread = threadId
      ? db
          .select()
          .from(dmThreads)
          .where(and(eq(dmThreads.id, threadId), eq(dmThreads.worldId, world.id)))
          .get()
      : undefined;
    if (!thread || thread.status !== "open") {
      logActivity({
        worldId: world.id,
        tick: world.simTick,
        actor: "strategist",
        action: "propose",
        status: "blocked",
        summary: `dm_reply dropped: no open thread matches "${threadId || "(none)"}"`,
        detail: { threadId, kind: action.kind },
      });
      return null;
    }
    payload = { threadId, text: action.angle };
  } else {
    payload = {
      postId: "",
      commentEngagementId: action.replyToEngagementId ?? "",
      text: action.angle,
    };
  }

  const id = randomUUID();
  const status = gate.requiresApproval ? "pending" : "auto_approved";
  db.insert(proposals)
    .values({
      id,
      worldId: world.id,
      kind: action.kind,
      status,
      payload,
      reasoning: action.reasoning,
      evidence: {
        ruleIds: action.evidenceRuleIds,
        banditArmId,
        signals: [action.angle],
        // where this candidate ranked in the pre-proposal dream (learned model
        // only — never the hidden config); null until anything has been scored
        dream:
          action.kind === "post"
            ? dreamFor(
                dream,
                (action.archetype ?? "education") as Archetype,
                (action.timeSlot ?? "morning") as TimeSlot,
                action.topic,
              )
            : null,
      },
      predictedEffect: sanitizePrediction(action.predictedEffect),
      riskClass: action.riskClass,
      createdTick: world.simTick,
    })
    .run();
  logActivity({
    worldId: world.id,
    tick: world.simTick,
    actor: "strategist",
    action: "propose",
    status,
    summary: action.reasoning,
    refType: "proposal",
    refId: id,
  });
  if (status === "auto_approved" && gate.earnedAutonomy) {
    // the human gate was waived because the agent's predictions earned it —
    // that is a trust event worth its own trail entry
    logActivity({
      worldId: world.id,
      tick: world.simTick,
      actor: "system",
      action: "earned_autonomy",
      status: "ok",
      summary: `Auto-approved without the human gate: calibration hit-rate ${Math.round((gate.earnedAutonomy.hitRate ?? 0) * 100)}% over the last ${gate.earnedAutonomy.reports >= 5 ? 5 : gate.earnedAutonomy.reports} scored posts`,
      refType: "proposal",
      refId: id,
      detail: gate.earnedAutonomy,
    });
  }
  if (status === "auto_approved") publishProposal(id);
  return id;
}

export async function runHeartbeat(worldId: string): Promise<{ proposalIds: string[] }> {
  const world = db.select().from(worlds).where(eq(worlds.id, worldId)).get()!;
  const s = db.select().from(settings).where(eq(settings.worldId, worldId)).get()!;
  const tick = world.simTick;
  const proposalIds: string[] = [];

  if (s.paused) {
    logActivity({
      worldId,
      tick,
      actor: "system",
      action: "heartbeat",
      status: "skipped",
      summary: "skipped: paused",
    });
    return { proposalIds };
  }

  const rules = getActiveRules(worldId);
  const rng = subRng(world.seed, "heartbeat", tick);
  const armStats = getArmStats(worldId, rng);
  const hitRate = rollingHitRate(worldId);
  const pillars = (world.config as WorldConfig).topics;
  const dream = dreamCandidates(worldId);
  const context = renderContext(
    worldId,
    tick,
    rules,
    armStats,
    hitRate,
    pillars,
    formatRulePerformance(getRulePerformance(worldId)),
    renderDreamPreview(dream),
  );

  const strat = await callAgent("strategist", StrategistOutput, SYSTEM.strategist, context, {
    worldSeed: world.seed,
    refId: `heartbeat-${tick}`,
  });

  if (!strat.ok) {
    insertQuarantined(world.id, tick, strat.error);
    logActivity({
      worldId,
      tick,
      actor: "strategist",
      action: "propose",
      status: "quarantined",
      summary: strat.error,
    });
    const extra = await runCommunityPass(worldId);
    return { proposalIds: extra.proposalIds };
  }

  logActivity({
    worldId,
    tick,
    actor: "strategist",
    action: "propose",
    status: "ok",
    summary: strat.data.strategyNote,
    detail: { actionCount: strat.data.actions.length },
  });

  for (const action of strat.data.actions) {
    const id = await processAction(world, groundTopic(worldId, tick, action, pillars, rng), armStats, dream);
    if (id) proposalIds.push(id);
  }

  const extra = await runCommunityPass(worldId);
  proposalIds.push(...extra.proposalIds);
  return { proposalIds };
}

export async function decideProposal(
  proposalId: string,
  decision: "approve" | "reject" | "edit",
  opts?: { reason?: string; editedPayload?: PostPayload },
): Promise<void> {
  const proposal = db.select().from(proposals).where(eq(proposals.id, proposalId)).get()!;
  const world = db.select().from(worlds).where(eq(worlds.id, proposal.worldId)).get()!;

  if (decision === "reject") {
    db.update(proposals)
      .set({
        status: "rejected",
        humanReason: opts?.reason ?? "",
        decidedTick: world.simTick,
      })
      .where(eq(proposals.id, proposalId))
      .run();
    logActivity({
      worldId: proposal.worldId,
      tick: world.simTick,
      actor: "human",
      action: "reject",
      status: "rejected",
      summary: opts?.reason ?? "rejected",
      refType: "proposal",
      refId: proposalId,
    });
    return;
  }

  if (decision === "edit") {
    const before = proposal.payload;
    const after = opts?.editedPayload ?? before;
    db.update(proposals)
      .set({
        status: "edited_approved",
        payload: after,
        humanEditDiff: { before, after },
        decidedTick: world.simTick,
      })
      .where(eq(proposals.id, proposalId))
      .run();
    logActivity({
      worldId: proposal.worldId,
      tick: world.simTick,
      actor: "human",
      action: "edit",
      status: "edited_approved",
      summary: "edited and approved",
      refType: "proposal",
      refId: proposalId,
    });
    publishProposal(proposalId);
    return;
  }

  db.update(proposals)
    .set({ status: "approved", decidedTick: world.simTick })
    .where(eq(proposals.id, proposalId))
    .run();
  logActivity({
    worldId: proposal.worldId,
    tick: world.simTick,
    actor: "human",
    action: "approve",
    status: "approved",
    summary: "approved",
    refType: "proposal",
    refId: proposalId,
  });
  publishProposal(proposalId);
}

export function getQuarantined(worldId: string) {
  return db
    .select()
    .from(proposals)
    .where(and(eq(proposals.worldId, worldId), eq(proposals.status, "quarantined")))
    .all();
}

export function rollbackPlaybook(worldId: string, targetVersion: number, tick: number) {
  const res = rollbackTo(worldId, targetVersion, tick);
  logActivity({
    worldId,
    tick,
    actor: "human",
    action: "rollback",
    status: "ok",
    summary: `rollback to v${targetVersion}`,
    refType: "playbook",
    refId: res.versionId,
  });
  return res;
}
