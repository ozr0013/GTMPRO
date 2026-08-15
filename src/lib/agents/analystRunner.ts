import { db } from "@/lib/db/client";
import { outcomeReports, posts, proposals, worlds } from "@/lib/db/schema";
import { AnalystOutput, type AnalystOutputT } from "@/lib/contracts";
import type { PredictedEffect } from "@/lib/types";
import { postMetrics } from "@/lib/sim/metrics";
import { computeReward, recordReward } from "@/lib/learning/bandit";
import { callAgent } from "./models";
import { SYSTEM } from "./prompts";
import { logActivity } from "./log";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

/** Outcomes are only judged once a post has had a full window to accumulate engagement. */
export const EVALUATION_WINDOW_TICKS = 24;

const FALLBACK_PREDICTION: PredictedEffect = {
  impressions: [0, 0],
  likes: [0, 0],
  linkClicks: [0, 0],
  signups: [0, 0],
};

/**
 * Day-boundary evaluation: every published brand post whose window has closed and
 * that has no outcome report yet gets one, plus a bandit reward. Never throws —
 * a failed analyst call is logged and the post is retried on the next boundary.
 */
export async function runAnalyst(worldId: string, tick: number): Promise<number> {
  const world = db.select().from(worlds).where(eq(worlds.id, worldId)).get()!;

  const due = db
    .select()
    .from(posts)
    .where(and(eq(posts.worldId, worldId), eq(posts.authorType, "brand"), eq(posts.status, "published")))
    .all()
    .filter((p) => (p.publishedTick ?? Infinity) + EVALUATION_WINDOW_TICKS <= tick)
    .filter(
      (p) =>
        !db
          .select()
          .from(outcomeReports)
          .where(and(eq(outcomeReports.worldId, worldId), eq(outcomeReports.postId, p.id)))
          .get(),
    );

  let written = 0;
  for (const post of due) {
    const actual = postMetrics(worldId, post.id);
    const proposal = post.proposalId
      ? db.select().from(proposals).where(eq(proposals.id, post.proposalId)).get()
      : undefined;
    const predicted = (proposal?.predictedEffect as PredictedEffect | undefined) ?? FALLBACK_PREDICTION;

    const result = await callAgent<AnalystOutputT>(
      "analyst",
      AnalystOutput,
      SYSTEM.analyst,
      [
        `Post: ${post.archetype} / ${post.topic}`,
        `Caption: ${post.caption}`,
        `Predicted: ${JSON.stringify(predicted)}`,
        `Actual: ${JSON.stringify(actual)}`,
      ].join("\n"),
      { worldSeed: world.seed, refId: post.id },
    );

    if (!result.ok) {
      logActivity({
        worldId,
        tick,
        actor: "analyst",
        action: "evaluate",
        status: "failed",
        summary: `Analyst failed on post ${post.id.slice(0, 8)} — will retry next day boundary`,
        refType: "post",
        refId: post.id,
        detail: { error: result.error },
      });
      continue;
    }

    db.insert(outcomeReports)
      .values({
        id: randomUUID(),
        worldId,
        postId: post.id,
        windowTicks: EVALUATION_WINDOW_TICKS,
        actual,
        predicted,
        verdict: result.data.verdict,
        attribution: result.data.attribution,
        summary: result.data.summary,
        tick,
      })
      .run();

    if (post.banditArmId) {
      recordReward(post.banditArmId, post.id, computeReward(actual, predicted), tick);
    }

    logActivity({
      worldId,
      tick,
      actor: "analyst",
      action: "evaluate",
      status: "ok",
      summary: `${result.data.verdict}: ${result.data.summary}`,
      refType: "post",
      refId: post.id,
      detail: { lessons: result.data.suggestedLessons },
    });
    written++;
  }
  return written;
}
