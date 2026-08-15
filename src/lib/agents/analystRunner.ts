import { db } from "@/lib/db/client";
import { outcomeReports, posts, proposals, worlds } from "@/lib/db/schema";
import type { PredictedEffect } from "@/lib/types";
import { callAgent } from "@/lib/agents/models";
import { SYSTEM } from "@/lib/agents/prompts";
import { logActivity } from "@/lib/agents/log";
import { AnalystOutput } from "@/lib/contracts";
import { computeReward, recordReward } from "@/lib/learning/bandit";
import { postMetrics } from "@/lib/sim/metrics";
import { postStreamKey } from "@/lib/sim/streams";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

const EMPTY_EFFECT: PredictedEffect = {
  impressions: [0, 0],
  likes: [0, 0],
  linkClicks: [0, 0],
  signups: [0, 0],
};

function tallyActual(postId: string, worldId: string) {
  const m = postMetrics(worldId, postId);
  return {
    impressions: m.impressions,
    likes: m.likes,
    linkClicks: m.linkClicks,
    signups: m.signups,
    dmsStarted: m.dmsStarted,
    meetings: m.meetings,
  };
}

/** Evaluate brand posts whose 24-tick window just closed. Track A clock calls this at day boundary. */
export async function runAnalyst(worldId: string, tick: number): Promise<{ reportIds: string[] }> {
  const world = db.select().from(worlds).where(eq(worlds.id, worldId)).get()!;
  const reported = new Set(
    db
      .select()
      .from(outcomeReports)
      .where(eq(outcomeReports.worldId, worldId))
      .all()
      .map((r) => r.postId),
  );
  const brandPosts = db
    .select()
    .from(posts)
    .where(and(eq(posts.worldId, worldId), eq(posts.authorType, "brand")))
    .all()
    .filter((p) => p.publishedTick != null && p.publishedTick + 24 <= tick && !reported.has(p.id));

  const reportIds: string[] = [];

  for (const post of brandPosts) {
    const proposal = post.proposalId
      ? db.select().from(proposals).where(eq(proposals.id, post.proposalId)).get()
      : undefined;
    const predicted = (proposal?.predictedEffect as PredictedEffect | undefined) ?? EMPTY_EFFECT;
    const actual = tallyActual(post.id, worldId);

    const analysis = await callAgent(
      "analyst",
      AnalystOutput,
      SYSTEM.analyst,
      JSON.stringify({ postId: post.id, archetype: post.archetype, topic: post.topic, actual, predicted }),
      // stable content key, not the row UUID — mock rng derives from refId and
      // UUID keys break same-seed determinism (the golden run guards this)
      { worldSeed: world.seed, refId: `an-${postStreamKey(post)}` },
    );

    const verdict = analysis.ok ? analysis.data.verdict : "met";
    const attribution = analysis.ok ? analysis.data.attribution : [];
    const summary = analysis.ok ? analysis.data.summary : analysis.error;

    const id = randomUUID();
    db.insert(outcomeReports)
      .values({
        id,
        worldId,
        postId: post.id,
        windowTicks: 24,
        actual,
        predicted,
        verdict,
        attribution,
        summary,
        tick,
      })
      .run();

    if (post.banditArmId) {
      recordReward(post.banditArmId, post.id, computeReward(actual), tick);
    }

    logActivity({
      worldId,
      tick,
      actor: "analyst",
      action: "evaluate",
      status: analysis.ok ? "ok" : "quarantined",
      summary,
      refType: "post",
      refId: post.id,
    });
    reportIds.push(id);
  }

  return { reportIds };
}
