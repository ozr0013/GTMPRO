import { describe, it, expect } from "vitest";
import { buildTinyWorld } from "./fixtures/world";
import { db } from "@/lib/db/client";
import { activityLog, outcomeReports, posts, proposals } from "@/lib/db/schema";
import {
  AUTONOMY_MIN_REPORTS,
  checkGuardrails,
  earnedAutonomy,
} from "@/lib/learning/guardrails";
import { runHeartbeat } from "@/lib/agents/orchestrator";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

function seedReports(worldId: string, n: number, accurate: boolean) {
  for (let i = 0; i < n; i++) {
    db.insert(outcomeReports)
      .values({
        id: randomUUID(),
        worldId,
        postId: randomUUID(),
        windowTicks: 24,
        actual: { impressions: 20, likes: 5, linkClicks: 1, signups: 0 },
        predicted: accurate
          ? { impressions: [10, 30], likes: [2, 8], linkClicks: [0, 2], signups: [0, 1] }
          : { impressions: [100, 200], likes: [50, 80], linkClicks: [10, 20], signups: [5, 9] },
        verdict: "met",
        attribution: [],
        summary: "seed",
        tick: 24 + i,
      })
      .run();
  }
}

describe("calibration-earned autonomy", () => {
  it("is earned only after enough accurate reports, and a slump revokes it", () => {
    const { worldId } = buildTinyWorld("autonomy-unit");
    expect(earnedAutonomy(worldId).earned).toBe(false); // nothing scored

    seedReports(worldId, AUTONOMY_MIN_REPORTS - 1, true);
    expect(earnedAutonomy(worldId).earned).toBe(false); // not enough evidence

    seedReports(worldId, 1, true);
    const earned = earnedAutonomy(worldId);
    expect(earned.earned).toBe(true);
    expect(earned.hitRate).toBe(1);

    // a run of misses drops the rolling window below the threshold
    seedReports(worldId, AUTONOMY_MIN_REPORTS, false);
    expect(earnedAutonomy(worldId).earned).toBe(false);
  });

  it("waives the human gate for low-risk actions but never for sensitive ones", async () => {
    const { worldId } = buildTinyWorld("autonomy-gate");
    seedReports(worldId, AUTONOMY_MIN_REPORTS, true);

    // propose mode + earned autonomy: the heartbeat's post goes straight through
    const { proposalIds } = await runHeartbeat(worldId);
    const post = proposalIds
      .map((id) => db.select().from(proposals).where(eq(proposals.id, id)).get()!)
      .find((p) => p.kind === "post")!;
    expect(post.status).toBe("executed"); // auto-approved and published
    expect(
      db
        .select()
        .from(posts)
        .where(and(eq(posts.worldId, worldId), eq(posts.authorType, "brand")))
        .all().length,
    ).toBe(1);

    // the waiver is a logged trust event
    const trail = db.select().from(activityLog).where(eq(activityLog.worldId, worldId)).all();
    expect(trail.some((l) => l.action === "earned_autonomy" && l.status === "ok")).toBe(true);

    // sensitive actions stay human-gated regardless
    const sensitive = checkGuardrails(worldId, {
      kind: "dm_reply",
      topic: "brewing-science",
      scheduledTick: 10,
      riskClass: "sensitive",
    });
    expect(sensitive.requiresApproval).toBe(true);
  });

  it("without earned autonomy, propose mode still gates everything", async () => {
    const { worldId } = buildTinyWorld("autonomy-not-earned");
    const { proposalIds } = await runHeartbeat(worldId);
    const post = proposalIds
      .map((id) => db.select().from(proposals).where(eq(proposals.id, id)).get()!)
      .find((p) => p.kind === "post")!;
    expect(post.status).toBe("pending");
  });
});
