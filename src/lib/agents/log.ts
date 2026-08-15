import { db } from "@/lib/db/client";
import { activityLog, settings, worlds } from "@/lib/db/schema";
import { formatSimTime } from "@/lib/sim/time";
import { isSlackEnabled, sendSlack } from "@/lib/notify/slack";
import { toNotifyEvent } from "@/lib/notify/activityNotifier";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

export type ActivityActor =
  | "strategist"
  | "copywriter"
  | "critic"
  | "analyst"
  | "coach"
  | "community"
  | "artdirector"
  | "publisher"
  | "human"
  | "system";

export function logActivity(entry: {
  worldId: string;
  tick: number;
  actor: ActivityActor;
  action: string;
  status: string;
  summary: string;
  refType?: string | null;
  refId?: string | null;
  detail?: unknown;
}): void {
  db.insert(activityLog)
    .values({
      id: randomUUID(),
      worldId: entry.worldId,
      tick: entry.tick,
      actor: entry.actor,
      action: entry.action,
      refType: entry.refType ?? null,
      refId: entry.refId ?? null,
      status: entry.status,
      summary: entry.summary,
      detail: entry.detail ?? null,
      createdAt: new Date(),
    })
    .run();

  notifyIfWorthIt(entry);
}

/**
 * Fire-and-forget Slack notification.
 *
 * Deliberately not awaited: logActivity is called inside the sim loop and from
 * server actions, and a slow or down Slack must never stall a tick or leave an
 * approval spinning in the UI. Errors are swallowed by sendSlack itself.
 *
 * Costs nothing when Slack is unconfigured — the guard runs before any work, so
 * tests and the offline demo never touch the network.
 */
function notifyIfWorthIt(entry: {
  worldId: string;
  tick: number;
  actor: string;
  action: string;
  status: string;
  summary: string;
}): void {
  try {
    const config = db.select().from(settings).where(eq(settings.worldId, entry.worldId)).get();
    // the UI switch is authoritative — an operator turning it off must silence the
    // world even when the env credentials are still present
    if (config && !config.slackEnabled) return;

    const target = config?.slackTarget ?? null;
    if (!isSlackEnabled(target)) return;

    const world = db.select().from(worlds).where(eq(worlds.id, entry.worldId)).get();
    const event = toNotifyEvent(
      entry,
      world?.name ?? "Flywheel",
      formatSimTime(entry.tick),
      (config?.slackNotify as string[] | null) ?? null,
    );
    if (!event) return;
    void sendSlack(event, target);
  } catch {
    // notification must never surface as an application error
  }
}
