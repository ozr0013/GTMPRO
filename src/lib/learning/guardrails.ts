import { db } from "@/lib/db/client";
import { settings, posts, funnelEvents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export interface GuardrailAction {
  kind: "post" | "reply" | "dm_reply";
  topic: string;
  scheduledTick: number;
  riskClass: "normal" | "sensitive";
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

  const requiresApproval = s.mode === "propose" || action.riskClass === "sensitive";
  return { allowed: reasons.length === 0, requiresApproval, reasons };
}
