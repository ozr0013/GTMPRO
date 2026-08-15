import { db } from "@/lib/db/client";
import { playbookRules } from "@/lib/db/schema";
import { getRulePerformance } from "./ruleEvidence";
import { and, eq } from "drizzle-orm";

/**
 * Write measured confidence onto a freshly-created playbook version.
 *
 * `createPlaybookVersion` copies each rule's confidence forward unchanged, so a
 * seeded 0.5 stayed 0.5 for the life of the world even after the rule had been
 * cited by a dozen scored posts. The Brain view renders that number, so it read
 * as "the agent is certain of nothing, forever".
 *
 * Confidence is derived, not accumulated — it is recomputed from the full
 * outcome history each time, so it stays correct across rollbacks.
 */
export function applyMeasuredConfidence(worldId: string, versionId: string): number {
  const perf = getRulePerformance(worldId);
  if (perf.size === 0) return 0;

  const rules = db
    .select()
    .from(playbookRules)
    .where(and(eq(playbookRules.worldId, worldId), eq(playbookRules.versionId, versionId)))
    .all();

  let updated = 0;
  for (const rule of rules) {
    const measured = perf.get(rule.ruleKey);
    if (!measured) continue;
    const next = Number(measured.confidence.toFixed(3));
    if (next === rule.confidence) continue;
    db.update(playbookRules)
      .set({ confidence: next })
      .where(eq(playbookRules.id, rule.id))
      .run();
    updated += 1;
  }
  return updated;
}
