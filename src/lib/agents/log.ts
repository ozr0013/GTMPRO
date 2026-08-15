import { db } from "@/lib/db/client";
import { activityLog } from "@/lib/db/schema";
import { randomUUID } from "node:crypto";

export type ActivityActor =
  | "strategist"
  | "copywriter"
  | "critic"
  | "analyst"
  | "coach"
  | "community"
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
}
