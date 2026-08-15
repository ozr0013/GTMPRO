import { db } from "@/lib/db/client";
import { outcomeReports, playbookVersions, proposals, worlds } from "@/lib/db/schema";
import type { PostPayload } from "@/lib/types";
import { callAgent } from "@/lib/agents/models";
import { SYSTEM } from "@/lib/agents/prompts";
import { logActivity } from "@/lib/agents/log";
import { CoachOutput } from "@/lib/contracts";
import {
  createPlaybookVersion,
  getActiveRules,
  getRecentlyRetiredRules,
  type PlaybookChanges,
} from "@/lib/learning/playbook";
import { getRulePerformance, underperformingRules } from "@/lib/learning/ruleEvidence";
import { applyMeasuredConfidence } from "@/lib/learning/ruleConfidence";
import { addressedRejections, outstandingRejections } from "@/lib/learning/humanFeedback";
import { collapseConvergedRules, dropDuplicateAdds } from "@/lib/learning/ruleDedupe";
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

  // Outstanding = no playbook rule cites this rejection yet, regardless of when it
  // happened. A rejection the coach ignored is re-raised next cycle instead of
  // ageing out of the time window unaddressed.
  const rejections = outstandingRejections(worldId);

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

  // Failure memory: the dedupe guard below only compares against ACTIVE rules,
  // so a rule retired two cycles ago can be re-derived from the same evidence
  // and quietly come back. Recently retired rules join the digest (so the live
  // coach knows) and the dedupe corpus (so a re-add is dropped either way).
  const recentlyRetired = getRecentlyRetiredRules(worldId);

  const digest = {
    // Human feedback leads the digest on purpose. When it trailed the outcome
    // reports, small local models wrote about metrics and silently ignored the
    // rejection — the exact beat the product is judged on.
    humanRejections_MUST_ADDRESS: rejections.map((r) => ({
      proposalId: r.proposalId,
      humanSaid: r.reason,
      rejectedCaption: r.rejectedCaption,
      requirement:
        "Add or amend a rule that would have prevented this draft, and put this proposalId in that rule's evidenceRefs.",
    })),
    humanEdits: edits,
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
    recentlyRetiredRules_DO_NOT_READD: recentlyRetired.map((r) => ({
      ruleKey: r.ruleKey,
      category: r.category,
      text: r.text,
      retiredInVersion: r.retiredInVersion,
      note: "this failed or was consolidated away — do not re-add it unless NEW evidence in this digest contradicts the retirement",
    })),
    outcomeReports: reports.map((r) => ({
      id: r.id,
      postId: r.postId,
      verdict: r.verdict,
      summary: r.summary,
      actual: r.actual,
      predicted: r.predicted,
      // the analyst's factor attribution and testable lessons are the coach's
      // richest signal — without them rule quality falls back to verdict-only
      attribution: r.attribution,
      suggestedLessons: r.suggestedLessons ?? [],
    })),
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

  // The coach re-derives the same lesson from the same report on consecutive
  // cycles; drop additions that restate a rule already in the playbook — or one
  // that was recently retired (failure memory, not just dedupe).
  const activeTexts = [
    ...getActiveRules(worldId).map((r) => r.text),
    ...recentlyRetired.map((r) => r.text),
  ];
  const deduped = dropDuplicateAdds(coach.data.playbookChanges.add, activeTexts);
  const changes: PlaybookChanges = { ...coach.data.playbookChanges, add: deduped.kept };

  if (deduped.dropped.length > 0) {
    logActivity({
      worldId,
      tick,
      actor: "coach",
      action: "dedupe",
      status: "ok",
      summary: `Dropped ${deduped.dropped.length} rule(s) that restated an existing one`,
      detail: deduped.dropped,
    });
  }

  // Amends can converge separate rules onto the same sentence, which the add-guard
  // above cannot see. Project the post-change rule set and retire whatever has
  // collapsed into a duplicate, keeping the copy with the most evidence.
  const projected = getActiveRules(worldId)
    .filter((r) => !changes.retire.includes(r.ruleKey))
    .map((r) => ({
      ruleKey: r.ruleKey,
      text: changes.amend.find((a) => a.ruleKey === r.ruleKey)?.text ?? r.text,
    }));
  const converged = collapseConvergedRules(projected, (key) => perf.get(key)?.citations ?? 0);
  if (converged.retire.length > 0) {
    changes.retire = [...changes.retire, ...converged.retire];
    logActivity({
      worldId,
      tick,
      actor: "coach",
      action: "dedupe",
      status: "ok",
      summary: `Collapsed ${converged.retire.length} rule(s) that amendments had converged onto an existing rule`,
      detail: converged.groups,
    });
  }

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

  // Audit the beat the product is judged on. An ignored rejection stays
  // outstanding and leads the next digest, so this surfaces rather than silently
  // disappearing — and gives us a metric for whether the coach is listening.
  const { addressed, ignored } = addressedRejections(worldId, rejections);
  if (rejections.length > 0) {
    logActivity({
      worldId,
      tick,
      actor: "coach",
      action: "human_feedback",
      status: ignored.length === 0 ? "ok" : "blocked",
      summary:
        ignored.length === 0
          ? `Turned ${addressed.length} human rejection(s) into playbook rules`
          : `${ignored.length} of ${rejections.length} rejection(s) still unaddressed — will lead the next digest`,
      detail: { addressed, ignored },
    });
  }

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
