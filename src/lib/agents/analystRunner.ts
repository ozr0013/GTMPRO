// Analyst runner: closes the outcome window on published brand posts,
// compares actuals to the strategist's predictions, and feeds the bandit.

import { db } from "@/lib/db/client";
import { worlds, posts, engagements, funnelEvents, proposals, outcomeReports } from "@/lib/db/schema";
import type { PredictedEffect } from "@/lib/types";
import { callAgent } from "@/lib/agents/models";
import { SYSTEM } from "@/lib/agents/prompts";
import { AnalystOutput } from "@/lib/contracts";
import { recordReward, computeReward } from "@/lib/learning/bandit";
import { logActivity, ZERO_EFFECT } from "@/lib/agents/orchestrator";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

export async function runAnalyst(worldId: string, tick: number): Promise<void> {
  const world = db.select().from(worlds).where(eq(worlds.id, worldId)).get()!;
  const reportedPostIds = new Set(
    db.select().from(outcomeReports).where(eq(outcomeReports.worldId, worldId)).all().map((r) => r.postId),
  );
  const duePosts = db
    .select()
    .from(posts)
    .where(and(eq(posts.worldId, worldId), eq(posts.authorType, "brand"), eq(posts.status, "published")))
    .all()
    .filter((p) => p.publishedTick != null && p.publishedTick <= tick - 1 && !reportedPostIds.has(p.id));

  for (const post of duePosts) {
    const postEngagements = db.select().from(engagements).where(eq(engagements.postId, post.id)).all();
    const attributedFunnel = db
      .select()
      .from(funnelEvents)
      .where(and(eq(funnelEvents.worldId, worldId), eq(funnelEvents.sourcePostId, post.id)))
      .all();
    const actual = {
      impressions: postEngagements.filter((e) => e.kind === "impression").length,
      likes: postEngagements.filter((e) => e.kind === "like").length,
      linkClicks: attributedFunnel.filter((e) => e.kind === "link_click").length,
      signups: attributedFunnel.filter((e) => e.kind === "signup").length,
    };
    const proposal = post.proposalId
      ? db.select().from(proposals).where(eq(proposals.id, post.proposalId)).get()
      : undefined;
    const predicted = (proposal?.predictedEffect as PredictedEffect | undefined) ?? ZERO_EFFECT;

    const analysis = await callAgent(
      "analyst",
      AnalystOutput,
      SYSTEM.analyst,
      `Post (${post.archetype}, topic "${post.topic}"): ${post.caption}\n\nPredicted ranges: ${JSON.stringify(predicted)}\nActual outcomes: ${JSON.stringify(actual)}`,
      { worldSeed: world.seed, refId: `an-${post.id}` },
    );
    if (!analysis.ok) {
      logActivity(worldId, tick, "system", "analyst_error", "error", `analyst failed: ${analysis.error}`, {
        refType: "post",
        refId: post.id,
      });
      continue;
    }

    db.insert(outcomeReports)
      .values({
        id: randomUUID(),
        worldId,
        postId: post.id,
        windowTicks: tick - post.publishedTick!,
        actual,
        predicted,
        verdict: analysis.data.verdict,
        attribution: analysis.data.attribution,
        summary: analysis.data.summary,
        tick,
      })
      .run();

    if (post.banditArmId) {
      recordReward(post.banditArmId, post.id, computeReward(actual, predicted), tick);
    }

    logActivity(worldId, tick, "analyst", "evaluate", analysis.data.verdict, analysis.data.summary, {
      refType: "post",
      refId: post.id,
    });
  }
}
