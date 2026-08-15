import { db } from "@/lib/db/client";
import { activityLog } from "@/lib/db/schema";
import { randomUUID } from "node:crypto";

export type Actor =
  | "strategist"
  | "copywriter"
  | "critic"
  | "analyst"
  | "coach"
  | "community"
  | "publisher"
  | "human"
  | "system";

export interface LogEntry {
  worldId: string;
  tick: number;
  actor: Actor;
  action: string;
  status: "ok" | "blocked" | "quarantined" | "failed";
  summary: string;
  refType?: string;
  refId?: string;
  detail?: unknown;
}

/** Single writer for activity_log — every agent, guardrail, and human decision lands here. */
export function logActivity(entry: LogEntry): void {
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
}
