// Rule-level attribution: closes the loop between "the strategist cited rule X"
// and "the post that cited it hit or missed".
//
// The bandit already learns from outcomes; without this the playbook does not.
// The coach could only ever ADD rules, because nothing told it which existing
// rules were implicated in a miss — so `confidence` sat at its seeded 0.5 forever
// and the playbook grew monotonically.
//
// Nothing new is stored: every link already exists as
//   outcome_reports.postId -> posts.proposalId -> proposals.evidence.ruleIds

import { db } from "@/lib/db/client";
import { outcomeReports, posts, proposals } from "@/lib/db/schema";
import { computeReward, type FunnelActual } from "./bandit";
import { eq } from "drizzle-orm";

export interface RulePerformance {
  ruleKey: string;
  /** number of scored posts that cited this rule */
  citations: number;
  exceeded: number;
  met: number;
  missed: number;
  /** mean bandit reward (0..1) across those posts */
  meanReward: number;
  /** meanReward shrunk toward 0.5 by citation count — see confidenceFor */
  confidence: number;
}

/**
 * Beta-style shrinkage: a rule cited once that happened to win is not yet
 * "0.9 confident". Pull the observed mean toward the 0.5 prior with a weight of
 * two pseudo-observations, so confidence only moves as evidence accumulates.
 */
const PRIOR_WEIGHT = 2;

export function confidenceFor(meanReward: number, citations: number): number {
  return (0.5 * PRIOR_WEIGHT + meanReward * citations) / (PRIOR_WEIGHT + citations);
}

/**
 * Per-rule outcome history for a world, keyed by ruleKey. Rules that have never
 * been cited by a scored post are absent — callers treat that as "no evidence yet".
 */
export function getRulePerformance(worldId: string): Map<string, RulePerformance> {
  const reports = db.select().from(outcomeReports).where(eq(outcomeReports.worldId, worldId)).all();
  if (reports.length === 0) return new Map();

  const postRows = new Map(
    db.select().from(posts).where(eq(posts.worldId, worldId)).all().map((p) => [p.id, p]),
  );
  const proposalRows = new Map(
    db.select().from(proposals).where(eq(proposals.worldId, worldId)).all().map((p) => [p.id, p]),
  );

  const acc = new Map<string, { rewards: number[]; exceeded: number; met: number; missed: number }>();

  for (const report of reports) {
    const post = postRows.get(report.postId);
    if (!post?.proposalId) continue;
    const proposal = proposalRows.get(post.proposalId);
    if (!proposal) continue;

    const ruleIds = (proposal.evidence as { ruleIds?: string[] } | null)?.ruleIds ?? [];
    if (ruleIds.length === 0) continue;

    const reward = computeReward(report.actual as FunnelActual);

    for (const ruleKey of ruleIds) {
      const entry = acc.get(ruleKey) ?? { rewards: [], exceeded: 0, met: 0, missed: 0 };
      entry.rewards.push(reward);
      if (report.verdict === "exceeded") entry.exceeded += 1;
      else if (report.verdict === "missed") entry.missed += 1;
      else entry.met += 1;
      acc.set(ruleKey, entry);
    }
  }

  const out = new Map<string, RulePerformance>();
  for (const [ruleKey, entry] of acc) {
    const citations = entry.rewards.length;
    const meanReward = entry.rewards.reduce((s, r) => s + r, 0) / citations;
    out.set(ruleKey, {
      ruleKey,
      citations,
      exceeded: entry.exceeded,
      met: entry.met,
      missed: entry.missed,
      meanReward,
      confidence: confidenceFor(meanReward, citations),
    });
  }
  return out;
}

/** Compact lines for a model prompt — the coach and strategist both read this. */
export function formatRulePerformance(perf: Map<string, RulePerformance>): string {
  if (perf.size === 0) return "(no rule has been scored yet)";
  return [...perf.values()]
    .sort((a, b) => a.meanReward - b.meanReward)
    .map(
      (p) =>
        `[${p.ruleKey}] cited by ${p.citations} scored post(s) — mean reward ${p.meanReward.toFixed(2)}, ` +
        `confidence ${p.confidence.toFixed(2)} (exceeded ${p.exceeded} / met ${p.met} / missed ${p.missed})`,
    )
    .join("\n");
}

/**
 * Rules whose measured performance is bad enough to be worth challenging.
 * Deliberately conservative: two citations minimum, so one unlucky post can't
 * retire a rule.
 */
export function underperformingRules(perf: Map<string, RulePerformance>): RulePerformance[] {
  return [...perf.values()].filter((p) => p.citations >= 2 && p.meanReward < 0.4);
}
