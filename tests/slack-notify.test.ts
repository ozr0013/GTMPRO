// No network here: these cover the routing policy and the payload shape. The
// transport itself is exercised by `npm run slack:test` against a real workspace.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { classify, enabledKinds, toNotifyEvent } from "@/lib/notify/activityNotifier";
import { buildSlackMessage, isSlackEnabled } from "@/lib/notify/slack";

const ENV_KEYS = ["SLACK_BOT_TOKEN", "SLACK_DM_TARGET", "SLACK_WEBHOOK_URL", "SLACK_NOTIFY"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const entry = (over: Partial<Parameters<typeof classify>[0]> = {}) => ({
  actor: "publisher",
  action: "publish_post",
  status: "published",
  summary: "published: Did you know cold brew tastes smoother?",
  ...over,
});

describe("slack is opt-in", () => {
  it("stays disabled with no config, so tests and the offline demo never call out", () => {
    expect(isSlackEnabled()).toBe(false);
  });

  it("enables on a webhook alone, or on token + target together", () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/x";
    expect(isSlackEnabled()).toBe(true);

    delete process.env.SLACK_WEBHOOK_URL;
    process.env.SLACK_BOT_TOKEN = "xoxb-1";
    // a token with nobody to send to is not usable
    expect(isSlackEnabled()).toBe(false);
    process.env.SLACK_DM_TARGET = "@omar";
    expect(isSlackEnabled()).toBe(true);
  });
});

describe("only news gets through, not trace", () => {
  it("routes a pending proposal to approvals — the one that must not be missed", () => {
    expect(classify(entry({ actor: "strategist", action: "propose", status: "pending" }))).toEqual({
      kind: "approval",
      path: "/approvals",
    });
  });

  it("routes publishes, playbook changes, blocks and meetings", () => {
    expect(classify(entry())?.kind).toBe("published");
    expect(classify(entry({ actor: "coach", action: "digest", status: "ok" }))?.kind).toBe("learned");
    expect(classify(entry({ status: "blocked" }))?.kind).toBe("blocked");
    expect(
      classify(entry({ actor: "community", action: "dm_reply", summary: "meeting booked" }))?.kind,
    ).toBe("meeting");
  });

  it("stays silent on routine trace", () => {
    expect(classify(entry({ actor: "critic", action: "review", status: "ok" }))).toBeNull();
    expect(classify(entry({ actor: "analyst", action: "evaluate", status: "ok" }))).toBeNull();
    // the coach's own dedupe/audit rows are bookkeeping, not a playbook change
    expect(classify(entry({ actor: "coach", action: "dedupe", status: "ok" }))).toBeNull();
  });

  it("honours SLACK_NOTIFY as a filter", () => {
    process.env.SLACK_NOTIFY = "approval";
    expect(enabledKinds().has("approval")).toBe(true);
    expect(enabledKinds().has("published")).toBe(false);

    const published = toNotifyEvent(entry(), "TestBrew", "Day 3, 07:00");
    expect(published).toBeNull();

    const approval = toNotifyEvent(
      entry({ actor: "strategist", action: "propose", status: "pending" }),
      "TestBrew",
      "Day 3, 07:00",
    );
    expect(approval?.kind).toBe("approval");
  });
});

describe("message payload", () => {
  it("carries a lock-screen preview, the world, and a deep link", () => {
    const event = toNotifyEvent(
      entry({ actor: "strategist", action: "propose", status: "pending" }),
      "TestBrew",
      "Day 3, 07:00",
    )!;
    const msg = buildSlackMessage(event, "https://demo.example.com");

    expect(msg.text).toContain("Approval needed");
    expect(msg.text).toContain("TestBrew");
    const json = JSON.stringify(msg.blocks);
    expect(json).toContain("https://demo.example.com/approvals");
    expect(json).toContain("Day 3, 07:00");
  });

  it("truncates a long body rather than letting Slack reject the block", () => {
    const msg = buildSlackMessage({
      kind: "published",
      worldName: "TestBrew",
      title: "Posted",
      body: "x".repeat(5000),
    });
    const section = JSON.stringify(msg.blocks);
    expect(section.length).toBeLessThan(4000);
    expect(section).toContain("…");
  });

  it("caps fields at Slack's limit of 10", () => {
    const fields = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, `v${i}`]));
    const msg = buildSlackMessage({ kind: "learned", worldName: "W", title: "T", fields });
    const fieldBlock = (msg.blocks as { type: string; fields?: unknown[] }[]).find((b) => b.fields);
    expect(fieldBlock?.fields).toHaveLength(10);
  });
});
