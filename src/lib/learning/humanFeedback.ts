// Human feedback is the strongest learning signal the system gets, and the one
// the product's headline claim rests on: reject with a reason -> the playbook
// changes -> the next proposal differs.
//
// It was being dropped. Two causes:
//   1. The coach digest listed rejections last, after active rules and outcome
//      reports, so a small local model reliably wrote about outcomes instead.
//   2. The "since last version" window used `decidedTick >= latest.createdTick`,
//      so a decision made on the same tick a version was cut got re-digested
//      every cycle — while a decision could also be silently dropped once a later
//      version landed, whether or not anything had addressed it.
//
// Both are fixed by tracking *addressed-ness* rather than time: a rejection is
// outstanding until some playbook rule cites its proposal id in evidence.refs.
// Nothing new is stored, and an ignored rejection is re-raised next cycle instead
// of vanishing.

import { db } from "@/lib/db/client";
import { playbookRules, proposals } from "@/lib/db/schema";
import type { PostPayload } from "@/lib/types";
import { eq } from "drizzle-orm";

export interface OutstandingRejection {
  proposalId: string;
  reason: string;
  decidedTick: number;
  /** what the human actually turned down, so the coach can write a preventive rule */
  rejectedCaption: string;
}

/** Every proposal id cited by any rule in any version of this world's playbook. */
export function citedProposalIds(worldId: string): Set<string> {
  const cited = new Set<string>();
  for (const rule of db.select().from(playbookRules).where(eq(playbookRules.worldId, worldId)).all()) {
    const evidence = rule.evidence as { refs?: string[] } | null;
    for (const ref of evidence?.refs ?? []) cited.add(ref);
  }
  return cited;
}

/**
 * Rejections that no playbook rule references yet. Ordered oldest first so the
 * longest-ignored feedback leads the digest.
 */
export function outstandingRejections(worldId: string): OutstandingRejection[] {
  const cited = citedProposalIds(worldId);
  return db
    .select()
    .from(proposals)
    .where(eq(proposals.worldId, worldId))
    .all()
    .filter((p) => p.status === "rejected" && (p.humanReason ?? "").trim().length > 0)
    .filter((p) => !cited.has(p.id))
    .sort((a, b) => (a.decidedTick ?? 0) - (b.decidedTick ?? 0))
    .map((p) => ({
      proposalId: p.id,
      reason: (p.humanReason ?? "").trim(),
      decidedTick: p.decidedTick ?? 0,
      rejectedCaption: (p.payload as PostPayload)?.caption ?? "",
    }));
}

/** Which of the given rejections a freshly-written version actually addressed. */
export function addressedRejections(
  worldId: string,
  before: OutstandingRejection[],
): { addressed: string[]; ignored: string[] } {
  const cited = citedProposalIds(worldId);
  const addressed: string[] = [];
  const ignored: string[] = [];
  for (const r of before) {
    (cited.has(r.proposalId) ? addressed : ignored).push(r.proposalId);
  }
  return { addressed, ignored };
}
