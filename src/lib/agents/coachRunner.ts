import { db } from "@/lib/db/client";
import { outcomeReports, playbookVersions, proposals, worlds } from "@/lib/db/schema";
import { CoachOutput, type CoachOutputT } from "@/lib/contracts";
import { createPlaybookVersion, getActiveRules } from "@/lib/learning/playbook";
import { callAgent } from "./models";
import { SYSTEM, formatRules } from "./prompts";
import { logActivity } from "./log";
import { desc, eq } from "drizzle-orm";

/**
 * Learning digest: everything that happened since the last playbook version —
 * analyst reports plus human rejections and edits — becomes the next version.
 * Human feedback is included on purpose: a rejection with a reason is the
 * strongest learning signal the system gets.
 */
export async function runCoach(worldId: string, tick: number): Promise<boolean> {
  const world = db.select().from(worlds).where(eq(worlds.id, worldId)).get()!;
  const latest = db
    .select()
    .from(playbookVersions)
    .where(eq(playbookVersions.worldId, worldId))
    .orderBy(desc(playbookVersions.version))
    .get()!;

  // The seed playbook is stamped at tick 0, which is also when the first decisions
  // can be made — so for the seed version the window is inclusive of its own tick.
  // Later versions use an exclusive boundary so nothing is digested twice.
  const since = latest.authorType === "seed" ? latest.createdTick - 1 : latest.createdTick;

  const newReports = db
    .select()
    .from(outcomeReports)
    .where(eq(outcomeReports.worldId, worldId))
    .all()
    .filter((r) => r.tick > since);

  const humanDecisions = db
    .select()
    .from(proposals)
    .where(eq(proposals.worldId, worldId))
    .all()
    // an approved proposal later flips to "executed", so edits are detected by the
    // edit diff (which survives) rather than by status
    .filter(
      (p) => (p.decidedTick ?? -1) > since && (p.status === "rejected" || p.humanEditDiff !== null),
    );

  // nothing new to learn from — skip rather than mint an empty version
  if (newReports.length === 0 && humanDecisions.length === 0) return false;

  const result = await callAgent<CoachOutputT>(
    "coach",
    CoachOutput,
    SYSTEM.coach,
    [
      `Current playbook (v${latest.version}):`,
      formatRules(getActiveRules(worldId)),
      "",
      "Analyst reports since last version:",
      newReports.map((r) => `- [${r.verdict}] ${r.summary}`).join("\n") || "(none)",
      "",
      "Human decisions since last version:",
      humanDecisions
        .map((p) => {
          const kind = p.status === "rejected" ? "rejected" : "edited before approving";
          return `- ${kind}: ${p.humanReason || "(no reason given)"}`;
        })
        .join("\n") || "(none)",
    ].join("\n"),
    { worldSeed: world.seed, refId: `coach-${latest.version}-${tick}` },
  );

  if (!result.ok) {
    logActivity({
      worldId,
      tick,
      actor: "coach",
      action: "digest",
      status: "failed",
      summary: "Coach failed — playbook unchanged this cycle",
      detail: { error: result.error },
    });
    return false;
  }

  const { version, diff } = createPlaybookVersion(
    worldId,
    result.data.playbookChanges,
    "coach",
    tick,
    result.data.changeSummary,
  );

  logActivity({
    worldId,
    tick,
    actor: "coach",
    action: "playbook_version",
    status: "ok",
    summary: `Playbook v${version}: ${result.data.changeSummary}`,
    refType: "playbook_version",
    refId: String(version),
    detail: {
      added: diff.added.map((r) => r.ruleKey),
      amended: diff.amended.map((r) => r.ruleKey),
      retired: diff.retired,
      sources: {
        outcomeReports: newReports.length,
        humanDecisions: humanDecisions.length,
      },
    },
  });
  return true;
}
