// Slack delivery for the human-in-the-loop: approvals get routed to a phone, and
// the things the agent actually did get reported back.
//
// Two transports, pick either in .env.local:
//   SLACK_BOT_TOKEN + SLACK_DM_TARGET  -> DMs a person (works with @handle, email, or Uxxxx)
//   SLACK_WEBHOOK_URL                  -> posts to one fixed channel (no OAuth setup)
//
// Disabled unless configured, so tests and the offline demo make zero network
// calls. Every send is fire-and-forget and swallows its own errors: a Slack
// outage must never break a sim tick or block an approval in the UI.

export type NotifyKind = "approval" | "published" | "learned" | "blocked" | "meeting";

export interface NotifyEvent {
  kind: NotifyKind;
  worldName: string;
  title: string;
  body?: string;
  /** label -> value, rendered as a compact fields block */
  fields?: Record<string, string>;
  /** deep link into Mission Control, e.g. /approvals */
  path?: string;
}

const KIND_EMOJI: Record<NotifyKind, string> = {
  approval: ":raised_hand:",
  published: ":rocket:",
  learned: ":brain:",
  blocked: ":no_entry:",
  meeting: ":handshake:",
};

/**
 * Credentials come from env, never the database: this repo commits
 * demo-snapshot.db, so a token stored in `settings` would be pushed to GitHub.
 * The routing target is not a secret and is overridable per world from the UI.
 */
export function slackConfig(targetOverride?: string | null) {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  const target = (targetOverride?.trim() || process.env.SLACK_DM_TARGET?.trim()) ?? undefined;
  const webhook = process.env.SLACK_WEBHOOK_URL?.trim();
  const baseUrl = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return { token, target, webhook, baseUrl };
}

/** True when a message could actually be delivered. */
export function isSlackEnabled(targetOverride?: string | null): boolean {
  const { token, target, webhook } = slackConfig(targetOverride);
  return Boolean(webhook) || Boolean(token && target);
}

/** What the settings UI needs to explain the current state to a human. */
export function slackReadiness(targetOverride?: string | null) {
  const { token, target, webhook } = slackConfig(targetOverride);
  return {
    hasToken: Boolean(token),
    hasWebhook: Boolean(webhook),
    hasTarget: Boolean(target),
    /** DMs need token+target; a webhook alone posts to its fixed channel */
    deliverable: Boolean(webhook) || Boolean(token && target),
    transport: token && target ? ("dm" as const) : webhook ? ("webhook" as const) : null,
  };
}

/** Block Kit payload. Exported so it can be asserted without touching the network. */
export function buildSlackMessage(event: NotifyEvent, baseUrl = slackConfig().baseUrl) {
  const heading = `${KIND_EMOJI[event.kind]}  *${event.title}*`;
  const blocks: unknown[] = [
    { type: "section", text: { type: "mrkdwn", text: heading } },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `Flywheel · ${event.worldName}` }],
    },
  ];

  if (event.body) {
    // Slack hard-fails a section over 3000 chars; captions and reasoning can run long
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: truncate(event.body, 2800) },
    });
  }

  const fields = Object.entries(event.fields ?? {});
  if (fields.length > 0) {
    // Block Kit caps a section at 10 fields
    blocks.push({
      type: "section",
      fields: fields.slice(0, 10).map(([k, v]) => ({
        type: "mrkdwn",
        text: `*${k}*\n${truncate(v, 200)}`,
      })),
    });
  }

  if (event.path) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: event.kind === "approval" ? "Review it" : "Open" },
          url: `${baseUrl}${event.path}`,
          ...(event.kind === "approval" ? { style: "primary" } : {}),
        },
      ],
    });
  }

  // text is the notification preview on a locked phone — keep it meaningful
  return { text: `${event.title} — ${event.worldName}`, blocks };
}

/** Resolve @handle / email to a Slack user id; ids and channel ids pass through. */
async function resolveTarget(token: string, target: string): Promise<string> {
  if (/^[UWC][A-Z0-9]{6,}$/i.test(target)) return target;

  if (target.includes("@") && target.includes(".")) {
    const res = await fetch(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(target)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const json = (await res.json()) as { ok: boolean; user?: { id: string }; error?: string };
    if (json.ok && json.user) return json.user.id;
    throw new Error(`users.lookupByEmail failed: ${json.error ?? "unknown"}`);
  }

  // @handle -> scan the member list (users.list needs users:read)
  const handle = target.replace(/^@/, "").toLowerCase();
  const res = await fetch("https://slack.com/api/users.list?limit=1000", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as {
    ok: boolean;
    members?: { id: string; name: string; profile?: { display_name?: string } }[];
    error?: string;
  };
  if (!json.ok || !json.members) throw new Error(`users.list failed: ${json.error ?? "unknown"}`);
  const match = json.members.find(
    (m) => m.name?.toLowerCase() === handle || m.profile?.display_name?.toLowerCase() === handle,
  );
  if (!match) throw new Error(`no Slack user matching "${target}"`);
  return match.id;
}

/**
 * Send, or quietly do nothing when Slack is not configured. Never throws and never
 * blocks the caller's critical path — returns why it skipped/failed for logging.
 */
export async function sendSlack(
  event: NotifyEvent,
  targetOverride?: string | null,
): Promise<{ sent: boolean; reason?: string }> {
  const { token, target, webhook, baseUrl } = slackConfig(targetOverride);
  if (!isSlackEnabled(targetOverride)) return { sent: false, reason: "not configured" };

  const message = buildSlackMessage(event, baseUrl);

  try {
    if (token && target) {
      const channel = await resolveTarget(token, target);
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ channel, ...message }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      // Slack returns HTTP 200 with ok:false — checking res.ok alone hides real failures
      if (!json.ok) return { sent: false, reason: json.error ?? "chat.postMessage failed" };
      return { sent: true };
    }

    const res = await fetch(webhook!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    if (!res.ok) return { sent: false, reason: `webhook HTTP ${res.status}` };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
