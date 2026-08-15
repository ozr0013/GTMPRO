import { describe, it, expect } from "vitest";
import { buildTinyWorld } from "./fixtures/world";
import { db } from "@/lib/db/client";
import { activityLog, playbookVersions } from "@/lib/db/schema";
import { LIBRARIAN_MAX_RULES, runLibrarianConsolidation } from "@/lib/agents/coachRunner";
import { createPlaybookVersion, getActiveRules } from "@/lib/learning/playbook";
import { eq, desc } from "drizzle-orm";

function bloatPlaybook(worldId: string) {
  // 10 adds on top of the 3 seed rules = 13 active, incl. one human constraint
  createPlaybookVersion(
    worldId,
    {
      add: [
        { category: "timing", text: "Post education at 7am sharp.", evidenceRefs: [], sourceType: "outcome" },
        { category: "timing", text: "Morning slots outperform midday for guides.", evidenceRefs: [], sourceType: "outcome" },
        { category: "timing", text: "Evening posts reach commuters scrolling home.", evidenceRefs: [], sourceType: "outcome" },
        { category: "timing", text: "Weekend mornings behave like weekday evenings.", evidenceRefs: [], sourceType: "outcome" },
        { category: "content", text: "Open with a concrete number.", evidenceRefs: [], sourceType: "outcome" },
        { category: "content", text: "Brew guides convert better than bean lore.", evidenceRefs: [], sourceType: "outcome" },
        { category: "content", text: "Comparison posts drive saves.", evidenceRefs: [], sourceType: "outcome" },
        { category: "voice", text: "Short sentences; no exclamation stacking.", evidenceRefs: [], sourceType: "outcome" },
        { category: "voice", text: "Address the reader as 'you', never 'customers'.", evidenceRefs: [], sourceType: "outcome" },
        {
          category: "audience",
          text: `Human rejection: "Never pitch decaf to the espresso crowd." — do not propose this pattern again.`,
          evidenceRefs: ["some-proposal"],
          sourceType: "rejection",
        },
      ],
      amend: [],
      retire: [],
    },
    "coach",
    12,
  );
}

describe("librarian consolidation (coach cycle)", () => {
  it("is a no-op while the playbook is at or under the cap", async () => {
    const { worldId } = buildTinyWorld("librarian-noop");
    expect(getActiveRules(worldId).length).toBeLessThanOrEqual(LIBRARIAN_MAX_RULES);
    const res = await runLibrarianConsolidation(worldId, 24);
    expect(res.versionId).toBeUndefined();
  });

  it("consolidates past the cap, never touching human-rejection rules", async () => {
    const { worldId } = buildTinyWorld("librarian-cap");
    bloatPlaybook(worldId);
    expect(getActiveRules(worldId).length).toBeGreaterThan(LIBRARIAN_MAX_RULES);

    const res = await runLibrarianConsolidation(worldId, 24);
    expect(res.versionId).toBeTruthy();

    const after = getActiveRules(worldId);
    expect(after.length).toBeLessThanOrEqual(LIBRARIAN_MAX_RULES);
    // the human constraint survived consolidation
    expect(after.some((r) => /Never pitch decaf/.test(r.text))).toBe(true);
    // consolidation never adds rules
    const latest = db
      .select()
      .from(playbookVersions)
      .where(eq(playbookVersions.worldId, worldId))
      .orderBy(desc(playbookVersions.version))
      .get()!;
    expect(latest.changeSummary).toMatch(/^consolidation:/);

    const log = db
      .select()
      .from(activityLog)
      .where(eq(activityLog.worldId, worldId))
      .all()
      .find((l) => l.actor === "coach" && l.action === "consolidate" && l.status === "ok");
    expect(log).toBeDefined();
  });
});
