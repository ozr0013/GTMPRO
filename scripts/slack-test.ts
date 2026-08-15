// Sends one of each notification to your Slack so you can check formatting and
// that it reaches your phone, without driving the sim.
//
//   npm run slack:test
//
// Reads .env.local. Nothing is sent unless you have configured Slack there.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      let value = m[2].trim();
      const quote = value[0];
      if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
        value = value.slice(1, -1);
      } else {
        const hash = value.indexOf("#");
        if (hash !== -1) value = value.slice(0, hash).trim();
      }
      if (!(m[1] in process.env)) process.env[m[1]] = value;
    }
  } catch {
    /* no .env.local */
  }
}
loadEnvLocal();

async function main() {
  const { isSlackEnabled, sendSlack, slackConfig } = await import("@/lib/notify/slack");

  if (!isSlackEnabled()) {
    console.error("Slack is not configured. Add to .env.local either:");
    console.error("  SLACK_BOT_TOKEN=xoxb-...   and  SLACK_DM_TARGET=@yourhandle");
    console.error("  (bot scopes: chat:write, users:read, users:read.email)");
    console.error("or, for a channel with no OAuth setup:");
    console.error("  SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...");
    process.exit(1);
  }

  const { token, target, baseUrl } = slackConfig();
  console.log(
    `Sending via ${token && target ? `DM to ${target}` : "webhook"} · links point at ${baseUrl}\n`,
  );

  const samples = [
    {
      kind: "approval" as const,
      title: "Approval needed",
      body: "Did you know cold brew often tastes smoother? That's a slower, cold extraction reducing the compounds behind bitterness.",
      fields: {
        Agent: "strategist",
        Archetype: "education / morning",
        Predicted: "15–30 impressions · 3–8 likes",
        "Sim time": "Day 3, 07:00",
      },
      path: "/approvals",
    },
    { kind: "published" as const, title: "Posted to Pictogram", body: "published: Did you know cold brew tastes smoother?", path: "/feed" },
    { kind: "learned" as const, title: "Playbook updated", body: "v6: lead with the insight, not the offer — from your rejection.", path: "/brain" },
    { kind: "blocked" as const, title: "Action blocked", body: "Guardrail: quiet hours 23:00–06:00", path: "/activity" },
    { kind: "meeting" as const, title: "Meeting booked", body: "@busy-pros-2 agreed to a 15-minute call.", path: "/analytics" },
  ];

  let failures = 0;
  for (const sample of samples) {
    const res = await sendSlack({ worldName: "TestBrew", ...sample });
    console.log(`${res.sent ? "SENT" : "FAIL"}  ${sample.kind}${res.reason ? ` — ${res.reason}` : ""}`);
    if (!res.sent) failures++;
  }

  if (failures > 0) {
    console.error(`\n${failures} failed. Common causes:`);
    console.error("  not_in_channel      — invite the bot to the channel");
    console.error("  missing_scope       — add chat:write (and users:read for @handle lookup)");
    console.error("  users_not_found     — use your email or Uxxxx id instead of @handle");
    process.exit(1);
  }
  console.log("\nAll five delivered. Check your phone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
