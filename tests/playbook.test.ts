import { describe, it, expect } from "vitest";
import { buildTinyWorld } from "./fixtures/world";
import { createPlaybookVersion, getActiveRules, diffVersions, rollbackTo } from "@/lib/learning/playbook";

describe("versioned playbook", () => {
  it("applies add/amend/retire and diffs versions", () => {
    const { worldId } = buildTinyWorld("pb-seed");
    const { version } = createPlaybookVersion(
      worldId,
      {
        add: [
          {
            category: "timing",
            text: "Post education at 7am",
            evidenceRefs: ["report-1"],
            sourceType: "outcome",
          },
        ],
        amend: [{ ruleKey: "voice-1", text: "Confident, warm, max 5 hashtags." }],
        retire: ["content-1"],
      },
      "coach",
      24,
    );
    expect(version).toBe(2);
    const rules = getActiveRules(worldId);
    expect(rules.find((r) => r.ruleKey === "content-1")).toBeUndefined();
    expect(rules.find((r) => r.ruleKey === "voice-1")!.text).toContain("max 5 hashtags");
    const diff = diffVersions(worldId, 1, 2);
    expect(diff.added.length).toBe(1);
    expect(diff.amended.length).toBe(1);
    expect(diff.retired).toEqual(["content-1"]);
  });

  it("rollback restores target rules as a NEW version", () => {
    const { worldId } = buildTinyWorld("pb-seed-2");
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
    rollbackTo(worldId, 1, 48);
    const rules = getActiveRules(worldId);
    expect(rules.map((r) => r.ruleKey).sort()).toEqual(["content-1", "timing-1", "voice-1"]);
    expect(rules.length).toBe(3);
  });
});
