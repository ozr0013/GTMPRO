// Coach runner: digests new outcome reports and human decisions since the last
// playbook version into playbook changes.

import { db } from "@/lib/db/client";
import { worlds, outcomeReports, proposals, playbookVersions } from "@/lib/db/schema";
import { callAgent } from "@/lib/agents/models";
import { SYSTEM } from "@/lib/agents/prompts";
import { CoachOutput } from "@/lib/contracts";
import { createPlaybookVersion } from "@/lib/learning/playbook";
import { logActivity } from "@/lib/agents/orchestrator";
import { desc, eq } from "drizzle-orm";

export async function runCoach(worldId: string, tick: number): Promise<void> {
  const world = db.select().from(worlds).where(eq(worlds.id, worldId)).get()!;
  const latestVersion = db
    .select()
    .from(playbookVersions)
    .where(eq(playbookVersions.worldId, worldId))
    .orderBy(desc(playbookVersions.version))
    .get()!;
  const since = latestVersion.createdTick;

  const newReports = db
    .select()
    .from(outcomeReports)
    .where(eq(outcomeReports.worldId, worldId))
    .all()
    .filter((r) => r.tick > since);
  // `>=` (not `>`): decisions made at the same tick a version was created — e.g. a
  // rejection at tick 0 against the seed playbook (createdTick 0) — must still be
  // digested by the next coach run.
  const humanFeedback = db
    .select()
    .from(proposals)
    .where(eq(proposals.worldId, worldId))
    .all()
    .filter(
      (p) =>
        p.decidedTick != null &&
        p.decidedTick >= since &&
        (p.status === "rejected" || p.status === "edited_approved"),
    );

  if (newReports.length === 0 && humanFeedback.length === 0) return;

  const digest = [
    "# New outcome reports",
    newReports.length
      ? newReports
          .map((r) => `- post ${r.postId}: ${r.verdict} — ${r.summary} (actual ${JSON.stringify(r.actual)})`)
          .join("\n")
      : "(none)",
    "# Human decisions",
    humanFeedback.length
      ? humanFeedback
          .map((p) =>
            p.status === "rejected"
              ? `- REJECTED (proposal reasoning: ${p.reasoning}) — human reason: ${p.humanReason ?? "(none given)"}`
              : `- EDITED before approval — diff: ${JSON.stringify(p.humanEditDiff)}`,
          )
          .join("\n")
      : "(none)",
  ].join("\n\n");

  const coach = await callAgent("coach", CoachOutput, SYSTEM.coach, digest, {
    worldSeed: world.seed,
    refId: `co-${tick}`,
  });
  if (!coach.ok) {
    logActivity(worldId, tick, "system", "coach_error", "error", `coach failed: ${coach.error}`);
    return;
  }

  const changes = coach.data.playbookChanges;
  if (changes.add.length + changes.amend.length + changes.retire.length === 0) return;

  const { version } = createPlaybookVersion(worldId, changes, "coach", tick, coach.data.changeSummary);
  logActivity(worldId, tick, "coach", "learn", "ok", coach.data.changeSummary, {
    refType: "playbook_version",
    refId: String(version),
  });
}
