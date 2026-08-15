import { db } from "@/lib/db/client";
import { settings, posts, funnelEvents, outcomeReports } from "@/lib/db/schema";
import { rollingHitRate } from "@/lib/learning/calibration";
import { eq, and } from "drizzle-orm";

export interface GuardrailAction {
  kind: "post" | "reply" | "dm_reply";
  topic: string;
  scheduledTick: number;
  riskClass: "normal" | "sensitive";
}

/** Consecutive scored posts required before autonomy can be earned. */
export const AUTONOMY_MIN_REPORTS = 5;
/** Calibration hit-rate the strategist must sustain over that window. */
export const AUTONOMY_HIT_RATE = 0.6;

export interface AutonomyStatus {
  earned: boolean;
  hitRate: number | null;
  reports: number;
}

/**
 * Dynamic autonomy: the agent EARNS the right to skip the human gate on
 * low-risk actions by predicting its own outcomes accurately — calibration
 * hit-rate ≥ AUTONOMY_HIT_RATE over the last AUTONOMY_MIN_REPORTS scored posts.
 * Sensitive actions stay human-gated forever; a calibration slump revokes the
 * privilege automatically on the next check. Autonomy is derived, not stored,
 * so it is always current and survives rollbacks.
 */
export function earnedAutonomy(worldId: string): AutonomyStatus {
  const reports = db
    .select()
    .from(outcomeReports)
    .where(eq(outcomeReports.worldId, worldId))
    .all().length;
  const hitRate = rollingHitRate(worldId, AUTONOMY_MIN_REPORTS);
  return {
    earned: reports >= AUTONOMY_MIN_REPORTS && (hitRate ?? 0) >= AUTONOMY_HIT_RATE,
    hitRate,
    reports,
  };
}

/** THE single gate: every action (heartbeat, autopilot, publisher) goes through here. */
export function checkGuardrails(worldId: string, action: GuardrailAction) {
  const s = db.select().from(settings).where(eq(settings.worldId, worldId)).get()!;
  const reasons: string[] = [];

  if (s.paused) reasons.push("agent is paused");

  const banned = s.bannedTopics as string[];
  if (banned.some((b) => action.topic.toLowerCase().includes(b.toLowerCase()))) {
    reasons.push(`banned topic: ${action.topic}`);
  }

  const hour = action.scheduledTick % 24;
  const [qStart, qEnd] = s.quietHours as [number, number];
  // wrap-around range (e.g. 23→6) means quiet if hour >= start OR hour < end
  const inQuiet = qStart > qEnd ? hour >= qStart || hour < qEnd : hour >= qStart && hour < qEnd;
  if (inQuiet && action.kind !== "dm_reply") reasons.push(`quiet hours (${qStart}:00-${qEnd}:00)`);

  if (action.kind === "post") {
    const dayStart = action.scheduledTick - (action.scheduledTick % 24);
    const today = db
      .select()
      .from(posts)
      .where(and(eq(posts.worldId, worldId), eq(posts.authorType, "brand")))
      .all()
      .filter((p) => p.scheduledTick >= dayStart).length;
    if (today >= s.maxPostsPerDay) reasons.push(`posts/day cap (${s.maxPostsPerDay}) reached`);
  }
  if (action.kind === "dm_reply") {
    const dayStart = action.scheduledTick - (action.scheduledTick % 24);
    const dmsToday = db
      .select()
      .from(funnelEvents)
      .where(and(eq(funnelEvents.worldId, worldId), eq(funnelEvents.kind, "dm_started")))
      .all()
      .filter((e) => e.tick >= dayStart).length;
    if (dmsToday >= s.maxDmsPerDay) reasons.push(`DMs/day cap (${s.maxDmsPerDay}) reached`);
  }

  // Sensitive actions are always human-gated. Normal actions skip the gate in
  // autopilot mode — or in propose mode once calibration accuracy has EARNED it.
  const autonomy =
    s.mode === "propose" && action.riskClass !== "sensitive" ? earnedAutonomy(worldId) : null;
  const requiresApproval =
    action.riskClass === "sensitive" || (s.mode === "propose" && !(autonomy?.earned ?? false));
  return {
    allowed: reasons.length === 0,
    requiresApproval,
    reasons,
    /** set only when earned autonomy is what waived the human gate */
    earnedAutonomy: autonomy?.earned ? autonomy : undefined,
  };
}

/** Decrement imageBudget by 1. Track C art director is the only spender. */
export function spendImageBudget(worldId: string): { ok: boolean } {
  const s = db.select().from(settings).where(eq(settings.worldId, worldId)).get()!;
  if (s.imageBudget <= 0) return { ok: false };
  db.update(settings)
    .set({ imageBudget: s.imageBudget - 1 })
    .where(eq(settings.worldId, worldId))
    .run();
  return { ok: true };
}
