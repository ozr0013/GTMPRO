import { db } from "@/lib/db/client";
import { outcomeReports, playbookVersions, proposals, worlds } from "@/lib/db/schema";
import type { PostPayload } from "@/lib/types";
import { callAgent } from "@/lib/agents/models";
import { SYSTEM } from "@/lib/agents/prompts";
import { logActivity } from "@/lib/agents/log";
import { CoachOutput } from "@/lib/contracts";
import { createPlaybookVersion, getActiveRules, type PlaybookChanges } from "@/lib/learning/playbook";
import { getRulePerformance, underperformingRules } from "@/lib/learning/ruleEvidence";
import { applyMeasuredConfidence } from "@/lib/learning/ruleConfidence";
import { desc, eq } from "drizzle-orm";

/** Unified word-level diff (`-removed` / `+added` / ` unchanged`). */
export function wordDiff(before: string, after: string): string {
  const a = before.split(/\s+/).filter(Boolean);
  const b = after.split(/\s+/).filter(Boolean);
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const parts: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      parts.push(` ${a[i]}`);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      parts.push(`-${a[i]}`);
      i += 1;
    } else {
      parts.push(`+${b[j]}`);
      j += 1;
    }
  }
  while (i < n) {
    parts.push(`-${a[i]}`);
    i += 1;
  }
  while (j < m) {
    parts.push(`+${b[j]}`);
    j += 1;
  }
  return parts.join(" ");
}

function captionBlob(payload: PostPayload): string {
  return `${payload.caption} ${(payload.hashtags ?? []).join(" ")}`.trim();
}

/** Digest new reports + human decisions since the last playbook version. Track A clock calls this after runAnalyst. */
export async function runCoach(worldId: string, tick: number): Promise<{ versionId?: string }> {
  const world = db.select().from(worlds).where(eq(worlds.id, worldId)).get()!;
  const latest = db
    .select()
    .from(playbookVersions)
    .where(eq(playbookVersions.worldId, worldId))
    .orderBy(desc(playbookVersions.version))
    .get()!;

  const reports = db
    .select()
    .from(outcomeReports)
    .where(eq(outcomeReports.worldId, worldId))
    .all()
    .filter((r) => r.tick >= latest.createdTick);

  const decided = db
    .select()
    .from(proposals)
    .where(eq(proposals.worldId, worldId))
    .all()
    .filter(
      (p) =>
        p.decidedTick != null &&
        p.decidedTick >= latest.createdTick &&
        (p.status === "rejected" || p.status === "edited_approved" || p.status === "executed" || p.status === "approved"),
    );

  const edits = decided
    .filter((p) => p.status === "edited_approved" || (p.status === "executed" && p.humanEditDiff))
    .map((p) => {
      const diff = p.humanEditDiff as { before: PostPayload; after: PostPayload } | null;
      if (!diff?.before || !diff?.after) return null;
      const beforeBlob = captionBlob(diff.before);
      const afterBlob = captionBlob(diff.after);
      return {
        proposalId: p.id,
        wordDiff: wordDiff(beforeBlob, afterBlob),
        beforeHashtags: diff.before.hashtags,
        afterHashtags: diff.after.hashtags,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e != null);

  const rejections = decided
    .filter((p) => p.status === "rejected")
    .map((p) => ({ proposalId: p.id, reason: p.humanReason ?? "" }));

  if (reports.length === 0 && rejections.length === 0 && edits.length === 0) {
    logActivity({
      worldId,
      tick,
      actor: "coach",
      action: "digest",
      status: "skipped",
      summary: "no new reports or human decisions",
    });
    return {};
  }

  // Rule-level attribution: which rules were cited by posts that hit or missed.
  // Without this the coach has no grounds to amend or retire anything, so the
  // playbook only ever grows.
  const perf = getRulePerformance(worldId);
  const weak = underperformingRules(perf);

  const digest = {
    activeRules: getActiveRules(worldId).map((r) => {
      const p = perf.get(r.ruleKey);
      return {
        ruleKey: r.ruleKey,
        category: r.category,
        text: r.text,
        measured: p
          ? {
              citations: p.citations,
              meanReward: Number(p.meanReward.toFixed(2)),
              exceeded: p.exceeded,
              met: p.met,
              missed: p.missed,
            }
          : "never cited by a scored post",
      };
    }),
    rulesContradictedByEvidence: weak.map((p) => ({
      ruleKey: p.ruleKey,
      meanReward: Number(p.meanReward.toFixed(2)),
      citations: p.citations,
      note: "cited repeatedly by posts that underperformed — amend or retire unless the reports explain it away",
    })),
    outcomeReports: reports.map((r) => ({
      id: r.id,
      postId: r.postId,
      verdict: r.verdict,
      summary: r.summary,
      actual: r.actual,
      predicted: r.predicted,
    })),
    rejections,
    edits,
  };

  const coach = await callAgent("coach", CoachOutput, SYSTEM.coach, JSON.stringify(digest, null, 2), {
    worldSeed: world.seed,
    refId: `coach-${tick}`,
  });

  if (!coach.ok) {
    logActivity({
      worldId,
      tick,
      actor: "coach",
      action: "digest",
      status: "quarantined",
      summary: coach.error,
    });
    return {};
  }

  const changes: PlaybookChanges = coach.data.playbookChanges;
  const empty = changes.add.length === 0 && changes.amend.length === 0 && changes.retire.length === 0;
  if (empty) {
    logActivity({
      worldId,
      tick,
      actor: "coach",
      action: "digest",
      status: "skipped",
      summary: "coach proposed no changes",
    });
    return {};
  }

  const res = createPlaybookVersion(worldId, changes, "coach", tick, coach.data.changeSummary);
  // carried-forward rules keep their seeded confidence; re-derive it from measured outcomes
  const reconfidenced = applyMeasuredConfidence(worldId, res.versionId);

  logActivity({
    worldId,
    tick,
    actor: "coach",
    action: "digest",
    status: "ok",
    summary: coach.data.changeSummary,
    refType: "playbook",
    refId: res.versionId,
    detail: {
      added: changes.add.length,
      amended: changes.amend.length,
      retired: changes.retire.length,
      rulesReconfidenced: reconfidenced,
      evidenceBase: [...perf.values()].map((p) => ({
        ruleKey: p.ruleKey,
        citations: p.citations,
        meanReward: Number(p.meanReward.toFixed(2)),
      })),
    },
  });
  return { versionId: res.versionId };
}
