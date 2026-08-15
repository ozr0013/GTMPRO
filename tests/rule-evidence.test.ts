import { describe, it, expect } from "vitest";
import { buildTinyWorld } from "./fixtures/world";
import { db } from "@/lib/db/client";
import { outcomeReports, playbookRules, posts, proposals } from "@/lib/db/schema";
import {
  confidenceFor,
  getRulePerformance,
  underperformingRules,
} from "@/lib/learning/ruleEvidence";
import { applyMeasuredConfidence } from "@/lib/learning/ruleConfidence";
import { getActivePlaybook } from "@/lib/db/queries";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

const PREDICTED = {
  impressions: [10, 20] as [number, number],
  likes: [4, 8] as [number, number],
  linkClicks: [1, 3] as [number, number],
  signups: [0, 2] as [number, number],
};

/** A scored post that cited `ruleIds`, hitting or missing every predicted metric. */
function scoredPost(worldId: string, ruleIds: string[], hit: boolean, tick = 30) {
  const proposalId = randomUUID();
  const postId = randomUUID();
  db.insert(proposals)
    .values({
      id: proposalId,
      worldId,
      kind: "post",
      status: "executed",
      payload: { caption: "c", hashtags: [], creativeBrief: "b", archetype: "education", timeSlot: "morning", topic: "t", scheduledTick: 7 },
      reasoning: "r",
      evidence: { ruleIds },
      predictedEffect: PREDICTED,
      riskClass: "normal",
      createdTick: 0,
    })
    .run();
  db.insert(posts)
    .values({
      id: postId,
      worldId,
      authorType: "brand",
      proposalId,
      archetype: "education",
      topic: "t",
      caption: "c",
      hashtags: [],
      creativeBrief: "b",
      scheduledTick: 7,
      publishedTick: 7,
      status: "published",
    })
    .run();
  // above the predicted midpoint on every metric = reward 1; far below = reward 0
  const actual = hit
    ? { impressions: 40, likes: 20, linkClicks: 10, signups: 5 }
    : { impressions: 0, likes: 0, linkClicks: 0, signups: 0 };
  db.insert(outcomeReports)
    .values({
      id: randomUUID(),
      worldId,
      postId,
      windowTicks: 24,
      actual,
      predicted: PREDICTED,
      verdict: hit ? "exceeded" : "missed",
      attribution: [],
      summary: hit ? "beat the range" : "missed the range",
      tick,
    })
    .run();
}

describe("rule-level outcome attribution", () => {
  it("attributes each scored post's reward to every rule it cited", () => {
    const { worldId } = buildTinyWorld("rule-ev");
    scoredPost(worldId, ["voice-1", "timing-1"], true);
    scoredPost(worldId, ["timing-1"], false);

    const perf = getRulePerformance(worldId);
    expect(perf.get("voice-1")).toMatchObject({ citations: 1, meanReward: 1, exceeded: 1 });
    // timing-1 rode one winner and one loser
    expect(perf.get("timing-1")).toMatchObject({ citations: 2, meanReward: 0.5, exceeded: 1, missed: 1 });
    expect(perf.has("content-1")).toBe(false); // never cited
  });

  it("shrinks confidence toward the prior when evidence is thin", () => {
    // one lucky win must not read as near-certainty
    expect(confidenceFor(1, 1)).toBeCloseTo(0.667, 2);
    expect(confidenceFor(1, 10)).toBeGreaterThan(confidenceFor(1, 1));
    expect(confidenceFor(0.5, 5)).toBeCloseTo(0.5, 5);
  });

  it("flags only repeatedly-underperforming rules, not one unlucky post", () => {
    const { worldId } = buildTinyWorld("rule-ev-weak");
    scoredPost(worldId, ["voice-1"], false);
    expect(underperformingRules(getRulePerformance(worldId))).toHaveLength(0);

    scoredPost(worldId, ["voice-1"], false, 31);
    const weak = underperformingRules(getRulePerformance(worldId));
    expect(weak.map((w) => w.ruleKey)).toEqual(["voice-1"]);
  });

  it("writes measured confidence onto the active version and exposes it to the UI", () => {
    const { worldId } = buildTinyWorld("rule-ev-conf");
    scoredPost(worldId, ["timing-1"], true);
    scoredPost(worldId, ["timing-1"], true, 31);

    const before = getActivePlaybook(worldId).rules.find((r) => r.ruleKey === "timing-1")!;
    expect(before.confidence).toBeCloseTo(0.4, 5); // seeded, untouched

    const versionId = db
      .select()
      .from(playbookRules)
      .where(eq(playbookRules.worldId, worldId))
      .all()[0].versionId;
    expect(applyMeasuredConfidence(worldId, versionId)).toBeGreaterThan(0);

    const after = getActivePlaybook(worldId).rules.find((r) => r.ruleKey === "timing-1")!;
    expect(after.confidence).toBeGreaterThan(before.confidence);
    expect(after.track).toMatchObject({ citations: 2, exceeded: 2 });
  });
});
