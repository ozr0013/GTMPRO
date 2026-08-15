import { describe, it, expect } from "vitest";
import { buildTinyWorld } from "./fixtures/world";
import { db } from "@/lib/db/client";
import { playbookRules, playbookVersions, proposals } from "@/lib/db/schema";
import { decideProposal, runHeartbeat } from "@/lib/agents/orchestrator";
import { runCoach, wordDiff } from "@/lib/agents/coachRunner";
import { getActiveRules } from "@/lib/learning/playbook";
import { eq } from "drizzle-orm";
import type { PostPayload } from "@/lib/types";

describe("edit distillation", () => {
  it("wordDiff marks removed hashtags", () => {
    expect(wordDiff("hello #coldbrew #coffeescience", "hello")).toMatch(/-#coldbrew/);
  });

  it("editing out hashtags yields a hashtag rule in the next playbook version", async () => {
    const { worldId } = buildTinyWorld("edit-distill");
    const { proposalIds } = await runHeartbeat(worldId);
    const proposal = db.select().from(proposals).where(eq(proposals.id, proposalIds[0])).get()!;
    const before = proposal.payload as PostPayload;
    expect(before.hashtags.length).toBeGreaterThan(0);

    const after: PostPayload = { ...before, hashtags: [] };
    await decideProposal(proposalIds[0], "edit", { editedPayload: after });

    const { versionId } = await runCoach(worldId, 24);
    expect(versionId).toBeTruthy();
    const latest = db
      .select()
      .from(playbookVersions)
      .where(eq(playbookVersions.worldId, worldId))
      .all()
      .sort((a, b) => b.version - a.version)[0]!;
    expect(latest.version).toBeGreaterThanOrEqual(2);
    const rules = getActiveRules(worldId);
    const added = db
      .select()
      .from(playbookRules)
      .where(eq(playbookRules.versionId, latest.id))
      .all()
      .filter((r) => /hashtag/i.test(r.text) || (r.evidence as { sourceType?: string })?.sourceType === "edit");
    expect(added.length).toBeGreaterThan(0);
    expect(rules.some((r) => /hashtag/i.test(r.text))).toBe(true);
  });
});
