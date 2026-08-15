import { describe, it, expect } from "vitest";
import { buildTinyWorld } from "./fixtures/world";
import { db } from "@/lib/db/client";
import { activityLog, proposals } from "@/lib/db/schema";
import { getQuarantined, rollbackPlaybook, runHeartbeat } from "@/lib/agents/orchestrator";
import { createPlaybookVersion, getActiveRules, getPlaybookHistory } from "@/lib/learning/playbook";
import { eq } from "drizzle-orm";

describe("rollback + quarantine surfaces", () => {
  it("getPlaybookHistory includes diffs vs parent", () => {
    const { worldId } = buildTinyWorld("hist-seed");
    createPlaybookVersion(
      worldId,
      {
        add: [{ category: "timing", text: "Post at 7am", evidenceRefs: [], sourceType: "outcome" }],
        amend: [],
        retire: [],
      },
      "coach",
      24,
    );
    const history = getPlaybookHistory(worldId);
    expect(history.length).toBeGreaterThanOrEqual(2);
    const v2 = history.find((h) => h.version === 2)!;
    expect(v2.diff.added.length).toBe(1);
    expect(v2.diff.retired).toEqual([]);
  });

  it("rollbackPlaybook restores seed rules and logs actor=human", () => {
    const { worldId } = buildTinyWorld("rb-seed");
    createPlaybookVersion(
      worldId,
      {
        add: [{ category: "content", text: "bad rule", evidenceRefs: [], sourceType: "outcome" }],
        amend: [],
        retire: [],
      },
      "coach",
      24,
    );
    rollbackPlaybook(worldId, 1, 48);
    const keys = getActiveRules(worldId)
      .map((r) => r.ruleKey)
      .sort();
    expect(keys).toEqual(["content-1", "timing-1", "voice-1"]);
    const log = db.select().from(activityLog).where(eq(activityLog.worldId, worldId)).all();
    expect(log.some((l) => l.actor === "human" && l.action === "rollback")).toBe(true);
  });

  it("getQuarantined is empty after a healthy heartbeat", async () => {
    const { worldId } = buildTinyWorld("q-healthy");
    await runHeartbeat(worldId);
    expect(getQuarantined(worldId)).toHaveLength(0);
    expect(db.select().from(proposals).where(eq(proposals.worldId, worldId)).all().length).toBeGreaterThan(0);
  });
});
