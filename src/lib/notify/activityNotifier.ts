// Policy layer: which agent events are worth interrupting a human for.
//
// Every agent step already flows through logActivity, so that is the hook point —
// but most rows are trace, not news. A phone that buzzes on every persona comment
// gets muted, and then the approval that actually needed a human is missed too.

import type { NotifyEvent, NotifyKind } from "./slack";

export interface ActivityEntry {
  actor: string;
  action: string;
  status: string;
  summary: string;
  refType?: string | null;
  refId?: string | null;
}

const DEFAULT_KINDS: NotifyKind[] = ["approval", "published", "learned", "blocked", "meeting"];

/** SLACK_NOTIFY=approval,learned trims the firehose; unset means the default set. */
export function enabledKinds(): Set<NotifyKind> {
  const raw = process.env.SLACK_NOTIFY?.trim();
  if (!raw) return new Set(DEFAULT_KINDS);
  const parsed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is NotifyKind => (DEFAULT_KINDS as string[]).includes(s));
  return new Set(parsed);
}

/**
 * Map an activity row to a notification, or null to stay quiet.
 * Deliberately conservative — anything not listed here is trace.
 */
export function classify(entry: ActivityEntry): { kind: NotifyKind; path: string } | null {
  const status = entry.status.toLowerCase();

  // something is waiting on a human — the one notification that must never be missed
  if (status === "pending") return { kind: "approval", path: "/approvals" };

  // guardrail or red-team stopped an action: the trust story, and worth knowing live
  if (status === "blocked" || status === "quarantined" || status === "expired") {
    return { kind: "blocked", path: "/activity" };
  }

  if (entry.actor === "publisher" && entry.action.startsWith("publish")) {
    return { kind: "published", path: "/feed" };
  }

  // the playbook actually changed — skip the coach's dedupe/audit rows
  if (entry.actor === "coach" && entry.action === "digest" && status === "ok") {
    return { kind: "learned", path: "/brain" };
  }

  if (entry.actor === "community" && /meeting/i.test(entry.summary)) {
    return { kind: "meeting", path: "/analytics" };
  }

  return null;
}

const TITLES: Record<NotifyKind, string> = {
  approval: "Approval needed",
  published: "Posted to Pictogram",
  learned: "Playbook updated",
  blocked: "Action blocked",
  meeting: "Meeting booked",
};

export function toNotifyEvent(
  entry: ActivityEntry,
  worldName: string,
  simLabel: string,
): NotifyEvent | null {
  const hit = classify(entry);
  if (!hit || !enabledKinds().has(hit.kind)) return null;

  return {
    kind: hit.kind,
    worldName,
    title: TITLES[hit.kind],
    body: entry.summary,
    fields: {
      Agent: entry.actor,
      Action: entry.action,
      "Sim time": simLabel,
    },
    path: hit.path,
  };
}
