import { describe, it, expect, vi, afterEach } from "vitest";
import { CoachOutput } from "@/lib/contracts";

const mocks = vi.hoisted(() => ({
  callAgent: vi.fn(),
}));

vi.mock("@/lib/agents/models", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents/models")>();
  mocks.callAgent.mockImplementation(actual.callAgent);
  return { ...actual, callAgent: mocks.callAgent };
});

import { buildTinyWorld } from "./fixtures/world";
import { db } from "@/lib/db/client";
import { activityLog, proposals } from "@/lib/db/schema";
import { runCoach } from "@/lib/agents/coachRunner";
import {
  createPlaybookVersion,
  getActiveRules,
  getRecentlyRetiredRules,
} from "@/lib/learning/playbook";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

afterEach(() => {
  mocks.callAgent.mockReset();
});

const RETIRED_TEXT = "Hypothesis: mornings perform best.";

function retireTimingRule(worldId: string) {
  createPlaybookVersion(
    worldId,
    { add: [], amend: [], retire: ["timing-1"] },
    "human",
    10,
    "human retired the timing hypothesis",
  );
}

function seedRejection(worldId: string): string {
  const id = randomUUID();
  db.insert(proposals)
    .values({
      id,
      worldId,
      kind: "post",
      status: "rejected",
      payload: {
        archetype: "product",
        timeSlot: "morning",
        topic: "brewing-science",
        caption: "Buy our concentrate now",
        hashtags: [],
        creativeBrief: "b",
        scheduledTick: 10,
      },
      reasoning: "seed",
      evidence: { ruleIds: [], signals: [] },
      predictedEffect: { impressions: [0, 0], likes: [0, 0], linkClicks: [0, 0], signups: [0, 0] },
      riskClass: "normal",
      humanReason: "Too pushy.",
      createdTick: 10,
      decidedTick: 10,
    })
    .run();
  return id;
}

describe("failure memory: retired rules stay retired", () => {
  it("getRecentlyRetiredRules lists a retirement and forgets it on revival", () => {
    const { worldId } = buildTinyWorld("failure-memory-1");
    retireTimingRule(worldId);

    const retired = getRecentlyRetiredRules(worldId);
    expect(retired.map((r) => r.ruleKey)).toContain("timing-1");
    expect(retired.find((r) => r.ruleKey === "timing-1")!.text).toBe(RETIRED_TEXT);

    // deliberate revival (e.g. rollback) removes it from failure memory
    createPlaybookVersion(
      worldId,
      { add: [{ category: "timing", text: RETIRED_TEXT, evidenceRefs: [], sourceType: "outcome" }], amend: [], retire: [] },
      "human",
      12,
    );
    const activeKeys = getActiveRules(worldId).map((r) => r.text);
    expect(activeKeys).toContain(RETIRED_TEXT);
    expect(getRecentlyRetiredRules(worldId).some((r) => r.text === RETIRED_TEXT)).toBe(false);
  });

  it("the coach cannot silently re-add a recently retired rule", async () => {
    const { worldId } = buildTinyWorld("failure-memory-2");
    retireTimingRule(worldId);
    const rejectionId = seedRejection(worldId);

    const actual = await vi.importActual<typeof import("@/lib/agents/models")>("@/lib/agents/models");
    mocks.callAgent.mockImplementation(async (role, schema, system, user, opts) => {
      if (role === "coach") {
        return {
          ok: true as const,
          data: CoachOutput.parse({
            playbookChanges: {
              add: [
                {
                  // re-derives the retired rule verbatim — must be dropped
                  category: "timing",
                  text: RETIRED_TEXT,
                  evidenceRefs: [opts.refId],
                  sourceType: "outcome",
                },
                {
                  category: "content",
                  text: `Human rejection: "Too pushy." — never open with a purchase demand.`,
                  evidenceRefs: [rejectionId],
                  sourceType: "rejection",
                },
              ],
              amend: [],
              retire: [],
            },
            changeSummary: "re-derived a retired lesson + addressed the rejection",
          }),
        };
      }
      return actual.callAgent(role, schema, system, user, opts);
    });

    const { versionId } = await runCoach(worldId, 24);
    expect(versionId).toBeTruthy();

    const active = getActiveRules(worldId);
    expect(active.some((r) => r.text === RETIRED_TEXT)).toBe(false); // stayed retired
    expect(active.some((r) => /never open with a purchase demand/.test(r.text))).toBe(true); // legit add kept

    const dedupeLog = db
      .select()
      .from(activityLog)
      .where(eq(activityLog.worldId, worldId))
      .all()
      .find((l) => l.actor === "coach" && l.action === "dedupe");
    expect(dedupeLog).toBeDefined();
  });

  it("the coach cannot retire or amend a human-rejection rule", async () => {
    const { worldId } = buildTinyWorld("failure-memory-3");
    // land a rejection-sourced rule first
    createPlaybookVersion(
      worldId,
      {
        add: [
          {
            category: "content",
            text: `Human rejection: "No discount talk." — do not propose this pattern again.`,
            evidenceRefs: ["some-rejection"],
            sourceType: "rejection",
          },
        ],
        amend: [],
        retire: [],
      },
      "coach",
      10,
    );
    const constraint = getActiveRules(worldId).find((r) => /No discount talk/.test(r.text))!;
    seedRejection(worldId); // gives the coach something to digest

    const actual = await vi.importActual<typeof import("@/lib/agents/models")>("@/lib/agents/models");
    mocks.callAgent.mockImplementation(async (role, schema, system, user, opts) => {
      if (role === "coach") {
        return {
          ok: true as const,
          data: CoachOutput.parse({
            playbookChanges: {
              add: [
                {
                  category: "voice",
                  text: "A fresh legitimate lesson about tone.",
                  evidenceRefs: [opts.refId],
                  sourceType: "outcome",
                },
              ],
              amend: [{ ruleKey: constraint.ruleKey, text: "watered-down version" }],
              retire: [constraint.ruleKey], // the coach tries to remove the human constraint
            },
            changeSummary: "attempts to retire a human constraint",
          }),
        };
      }
      return actual.callAgent(role, schema, system, user, opts);
    });

    await runCoach(worldId, 24);

    const after = getActiveRules(worldId).find((r) => r.ruleKey === constraint.ruleKey);
    expect(after).toBeDefined(); // survived
    expect(after!.text).toBe(constraint.text); // text untouched
    const blocked = db
      .select()
      .from(activityLog)
      .where(eq(activityLog.worldId, worldId))
      .all()
      .find((l) => l.action === "digest" && l.status === "blocked" && /human constraint/.test(l.summary));
    expect(blocked).toBeDefined();
  });

  it("a rejection add resembling a retired rule is NOT deduped away (no livelock)", async () => {
    const { worldId } = buildTinyWorld("failure-memory-4");
    retireTimingRule(worldId); // failure memory now contains RETIRED_TEXT
    const rejectionId = seedRejection(worldId);

    const actual = await vi.importActual<typeof import("@/lib/agents/models")>("@/lib/agents/models");
    mocks.callAgent.mockImplementation(async (role, schema, system, user, opts) => {
      if (role === "coach") {
        return {
          ok: true as const,
          data: CoachOutput.parse({
            playbookChanges: {
              add: [
                {
                  // near-identical to the retired rule, but sourced from a HUMAN
                  // rejection — must survive dedupe or the rejection livelocks
                  category: "timing",
                  text: "Hypothesis: mornings perform best!",
                  evidenceRefs: [rejectionId],
                  sourceType: "rejection",
                },
              ],
              amend: [],
              retire: [],
            },
            changeSummary: "rejection distilled into a timing constraint",
          }),
        };
      }
      return actual.callAgent(role, schema, system, user, opts);
    });

    const { versionId } = await runCoach(worldId, 24);
    expect(versionId).toBeTruthy();
    expect(getActiveRules(worldId).some((r) => r.text === "Hypothesis: mornings perform best!")).toBe(true);
  });
});
