import { db } from "@/lib/db/client";
import { playbookVersions, playbookRules, banditArms, banditSnapshots } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";

export interface PlaybookChanges {
  add: {
    category: string;
    text: string;
    evidenceRefs: string[];
    sourceType: "outcome" | "rejection" | "edit";
  }[];
  amend: { ruleKey: string; text: string }[];
  retire: string[];
}

/** Plain insert shape for playbook_rules (evidence is a JSON column typed unknown). */
interface RuleInsert {
  id: string;
  worldId: string;
  versionId: string;
  ruleKey: string;
  category: string;
  text: string;
  confidence: number;
  evidence: unknown;
}

function latestVersion(worldId: string) {
  return db
    .select()
    .from(playbookVersions)
    .where(eq(playbookVersions.worldId, worldId))
    .orderBy(desc(playbookVersions.version))
    .get()!;
}

function rulesOf(worldId: string, versionId: string) {
  return db
    .select()
    .from(playbookRules)
    .where(and(eq(playbookRules.worldId, worldId), eq(playbookRules.versionId, versionId)))
    .all();
}

export function getActiveRules(worldId: string) {
  return rulesOf(worldId, latestVersion(worldId).id);
}

export function createPlaybookVersion(
  worldId: string,
  changes: PlaybookChanges,
  author: "coach" | "human" | "rollback",
  tick: number,
  summaryOverride?: string,
) {
  const parent = latestVersion(worldId);
  const parentRules = rulesOf(worldId, parent.id);
  const versionId = randomUUID();
  const version = parent.version + 1;

  // full copy: carry every non-retired parent rule forward (amended text where given)
  const next: RuleInsert[] = parentRules
    .filter((r) => !changes.retire.includes(r.ruleKey))
    .map((r) => {
      const amend = changes.amend.find((a) => a.ruleKey === r.ruleKey);
      return {
        id: randomUUID(),
        worldId,
        versionId,
        ruleKey: r.ruleKey,
        category: r.category,
        text: amend ? amend.text : r.text,
        confidence: r.confidence,
        evidence: r.evidence,
      };
    });
  for (const a of changes.add) {
    next.push({
      id: randomUUID(),
      worldId,
      versionId,
      ruleKey: `rule-${randomUUID().slice(0, 8)}`,
      category: a.category,
      text: a.text,
      confidence: 0.5,
      evidence: { sourceType: a.sourceType, refs: a.evidenceRefs },
    });
  }

  const summary =
    summaryOverride ??
    `+${changes.add.length} rules, ~${changes.amend.length} amended, -${changes.retire.length} retired`;
  db.insert(playbookVersions)
    .values({
      id: versionId,
      worldId,
      version,
      parentVersion: parent.version,
      changeSummary: summary,
      authorType: author,
      createdTick: tick,
    })
    .run();
  for (const r of next) {
    db.insert(playbookRules).values(r).run();
  }
  // snapshot bandit posteriors alongside every playbook version (cheap rollback context)
  const arms = db.select().from(banditArms).where(eq(banditArms.worldId, worldId)).all();
  db.insert(banditSnapshots)
    .values({ id: randomUUID(), worldId, playbookVersionId: versionId, armsJson: arms })
    .run();

  return { versionId, version, diff: diffVersions(worldId, parent.version, version) };
}

export function diffVersions(worldId: string, vA: number, vB: number) {
  const va = db
    .select()
    .from(playbookVersions)
    .where(and(eq(playbookVersions.worldId, worldId), eq(playbookVersions.version, vA)))
    .get()!;
  const vb = db
    .select()
    .from(playbookVersions)
    .where(and(eq(playbookVersions.worldId, worldId), eq(playbookVersions.version, vB)))
    .get()!;
  const a = new Map(rulesOf(worldId, va.id).map((r) => [r.ruleKey, r]));
  const b = new Map(rulesOf(worldId, vb.id).map((r) => [r.ruleKey, r]));
  return {
    added: [...b.values()].filter((r) => !a.has(r.ruleKey)),
    amended: [...b.values()].filter((r) => a.has(r.ruleKey) && a.get(r.ruleKey)!.text !== r.text),
    retired: [...a.keys()].filter((k) => !b.has(k)),
  };
}

export function rollbackTo(worldId: string, targetVersion: number, tick: number) {
  const current = latestVersion(worldId);
  const target = db
    .select()
    .from(playbookVersions)
    .where(and(eq(playbookVersions.worldId, worldId), eq(playbookVersions.version, targetVersion)))
    .get()!;
  const targetRules = rulesOf(worldId, target.id);
  const currentRules = rulesOf(worldId, current.id);
  const targetKeys = new Set(targetRules.map((r) => r.ruleKey));
  const changes: PlaybookChanges = {
    add: [], // restore-by-copy below instead of add (keeps ruleKeys stable)
    amend: targetRules
      .filter((r) => currentRules.some((c) => c.ruleKey === r.ruleKey && c.text !== r.text))
      .map((r) => ({ ruleKey: r.ruleKey, text: r.text })),
    retire: currentRules.filter((c) => !targetKeys.has(c.ruleKey)).map((c) => c.ruleKey),
  };
  const res = createPlaybookVersion(worldId, changes, "rollback", tick, `rollback to v${targetVersion}`);
  // re-insert rules that existed in target but were retired since (stable ruleKey restore)
  const afterKeys = new Set(getActiveRules(worldId).map((r) => r.ruleKey));
  for (const r of targetRules) {
    if (!afterKeys.has(r.ruleKey)) {
      const restored: RuleInsert = {
        id: randomUUID(),
        worldId,
        versionId: res.versionId,
        ruleKey: r.ruleKey,
        category: r.category,
        text: r.text,
        confidence: r.confidence,
        evidence: r.evidence,
      };
      db.insert(playbookRules).values(restored).run();
    }
  }
  return { versionId: res.versionId };
}
