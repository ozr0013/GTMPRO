import { describe, it, expect } from "vitest";
import { buildTinyWorld } from "./fixtures/world";
import { db } from "@/lib/db/client";
import { playbookRules, playbookVersions, proposals } from "@/lib/db/schema";
import { addressedRejections, outstandingRejections } from "@/lib/learning/humanFeedback";
import { dropDuplicateAdds, textSimilarity } from "@/lib/learning/ruleDedupe";
import { desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

function rejectedProposal(worldId: string, reason: string, decidedTick: number) {
  const id = randomUUID();
  db.insert(proposals)
    .values({
      id,
      worldId,
      kind: "post",
      status: "rejected",
      payload: {
        caption: "Buy now! 50% off our best cold brew, today only!",
        hashtags: [],
        creativeBrief: "b",
        archetype: "product",
        timeSlot: "morning",
        topic: "t",
        scheduledTick: 7,
      },
      reasoning: "r",
      evidence: { ruleIds: [] },
      predictedEffect: { impressions: [1, 2], likes: [1, 2], linkClicks: [0, 1], signups: [0, 1] },
      riskClass: "normal",
      createdTick: decidedTick,
      decidedTick,
      humanReason: reason,
    })
    .run();
  return id;
}

/** Add a rule to the world's newest version, citing `refs`. */
function addRule(worldId: string, text: string, refs: string[]) {
  const version = db
    .select()
    .from(playbookVersions)
    .where(eq(playbookVersions.worldId, worldId))
    .orderBy(desc(playbookVersions.version))
    .get()!;
  db.insert(playbookRules)
    .values({
      id: randomUUID(),
      worldId,
      versionId: version.id,
      ruleKey: `rule-${randomUUID().slice(0, 8)}`,
      category: "voice",
      text,
      confidence: 0.5,
      evidence: { sourceType: "rejection", refs },
    })
    .run();
}

describe("human rejections are tracked until a rule addresses them", () => {
  it("stays outstanding until a playbook rule cites it", () => {
    const { worldId } = buildTinyWorld("hf-outstanding");
    const id = rejectedProposal(worldId, "too salesy", 48);

    expect(outstandingRejections(worldId).map((r) => r.proposalId)).toEqual([id]);
    // the caption goes along, so the coach can write a preventive rule
    expect(outstandingRejections(worldId)[0].rejectedCaption).toContain("50% off");

    addRule(worldId, "Never lead with a discount; open with the insight.", [id]);
    expect(outstandingRejections(worldId)).toHaveLength(0);
  });

  it("re-raises an ignored rejection instead of ageing it out", () => {
    const { worldId } = buildTinyWorld("hf-reraise");
    const id = rejectedProposal(worldId, "too salesy", 48);

    // a later version that addresses something else entirely
    addRule(worldId, "Post education content between 7 and 9am.", ["some-other-post"]);

    // the old time-window logic dropped this; it must still be outstanding
    expect(outstandingRejections(worldId).map((r) => r.proposalId)).toEqual([id]);
  });

  it("reports which rejections a version addressed and which it ignored", () => {
    const { worldId } = buildTinyWorld("hf-audit");
    const addressedId = rejectedProposal(worldId, "too salesy", 48);
    const ignoredId = rejectedProposal(worldId, "wrong audience", 48);
    const before = outstandingRejections(worldId);
    expect(before).toHaveLength(2);

    addRule(worldId, "Never lead with a discount.", [addressedId]);

    const audit = addressedRejections(worldId, before);
    expect(audit.addressed).toEqual([addressedId]);
    expect(audit.ignored).toEqual([ignoredId]);
  });

  it("ignores rejections with no written reason", () => {
    const { worldId } = buildTinyWorld("hf-noreason");
    rejectedProposal(worldId, "   ", 48);
    expect(outstandingRejections(worldId)).toHaveLength(0);
  });
});

describe("near-duplicate rules are dropped", () => {
  it("recognises a restatement of the same rule", () => {
    const a =
      "Educational posts must include a clear call-to-action and use the 'Did you know?' format to boost engagement by 35% among connoisseurs.";
    const b =
      "Educational posts must use the 'Did you know?' format and include a clear CTA to boost engagement by 35% among connoisseurs and health enthusiasts.";
    expect(textSimilarity(a, b)).toBeGreaterThan(0.6);
    // an unrelated rule must not trip the threshold
    expect(textSimilarity(a, "Post memes between 8 and 10am for college students.")).toBeLessThan(0.3);
  });

  it("keeps the first and drops the restatement, reporting what it dropped", () => {
    const existing = ["Educational posts must include a clear call-to-action and use the 'Did you know?' format."];
    const adds = [
      { text: "Educational posts must use the 'Did you know?' format and include a clear CTA." },
      { text: "Never mention competitor pricing in a caption." },
    ];
    const { kept, dropped } = dropDuplicateAdds(adds, existing);
    expect(kept.map((k) => k.text)).toEqual(["Never mention competitor pricing in a caption."]);
    expect(dropped).toHaveLength(1);
  });

  it("dedupes within a single batch too", () => {
    const adds = [
      { text: "Never lead a caption with a discount offer." },
      { text: "Captions must never lead with a discount offer." },
    ];
    expect(dropDuplicateAdds(adds, []).kept).toHaveLength(1);
  });
});
