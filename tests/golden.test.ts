// A4: golden-run regression guard. Plays 5 scripted sim-days on a fixed-seed genesis
// world in autopilot (with a diligent human approving gated proposals daily) and
// compares aggregate outcomes to a committed snapshot. Any engine/funnel/learning
// change that shifts simulation behavior fails here first — intentionally.
//
// Regenerate deliberately after intended behavior changes:
//   UPDATE_GOLDEN=1 npx vitest run tests/golden.test.ts

import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "@/lib/db/client";
import {
  posts,
  engagements,
  funnelEvents,
  dmThreads,
  dmMessages,
  proposals,
  playbookVersions,
  playbookRules,
  banditObservations,
  personas,
  settings,
  outcomeReports,
} from "@/lib/db/schema";
import { generateWorld } from "@/lib/sim/genesis";
import { advanceTicks } from "@/lib/sim/clock";
import { decideProposal } from "@/lib/agents/orchestrator";
import { eq, and } from "drizzle-orm";

const GOLDEN_PATH = resolve(__dirname, "fixtures/golden.json");

function countBy<T>(rows: T[], key: (r: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[key(r)] = (out[key(r)] ?? 0) + 1;
  // stable key order for readable diffs
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

async function playGoldenRun(): Promise<Record<string, unknown>> {
  const { worldId } = await generateWorld("Cold brew concentrate for coffee obsessives", {
    seed: "golden-seed",
    name: "GoldenBrew",
  });
  db.update(settings).set({ mode: "autopilot" }).where(eq(settings.worldId, worldId)).run();

  for (let day = 1; day <= 5; day++) {
    await advanceTicks(worldId, 24);
    // diligent human: approve everything still gated (sensitive DMs etc.)
    const pending = db
      .select()
      .from(proposals)
      .where(and(eq(proposals.worldId, worldId), eq(proposals.status, "pending")))
      .all();
    for (const p of pending) {
      await decideProposal(p.id, "approve");
    }
  }

  const post = db.select().from(posts).where(eq(posts.worldId, worldId)).all();
  const eng = db.select().from(engagements).where(eq(engagements.worldId, worldId)).all();
  const funnel = db.select().from(funnelEvents).where(eq(funnelEvents.worldId, worldId)).all();
  const threads = db.select().from(dmThreads).where(eq(dmThreads.worldId, worldId)).all();
  const props = db.select().from(proposals).where(eq(proposals.worldId, worldId)).all();
  const versions = db.select().from(playbookVersions).where(eq(playbookVersions.worldId, worldId)).all();
  const latestVersion = versions.reduce((a, b) => (a.version > b.version ? a : b));
  const rules = db
    .select()
    .from(playbookRules)
    .where(and(eq(playbookRules.worldId, worldId), eq(playbookRules.versionId, latestVersion.id)))
    .all();
  const reports = db.select().from(outcomeReports).where(eq(outcomeReports.worldId, worldId)).all();
  const followers = db
    .select()
    .from(personas)
    .where(and(eq(personas.worldId, worldId), eq(personas.isFollower, true)))
    .all();
  const dmMsgCount = threads
    .map((t) => db.select().from(dmMessages).where(eq(dmMessages.threadId, t.id)).all().length)
    .reduce((a, b) => a + b, 0);
  const observations = db.select().from(banditObservations).all().length;

  return {
    posts: countBy(post, (p) => p.authorType),
    engagements: countBy(eng, (e) => e.kind),
    funnel: countBy(funnel, (e) => e.kind),
    dmThreads: countBy(threads, (t) => t.status),
    dmMessages: dmMsgCount,
    proposals: countBy(props, (p) => p.status),
    playbookVersionCount: versions.length,
    activeRuleCount: rules.length,
    outcomeReports: reports.length,
    banditObservations: observations,
    followers: followers.length,
  };
}

describe("golden run (A4)", () => {
  it("5 scripted sim-days match the committed snapshot exactly", async () => {
    const summary = await playGoldenRun();

    if (process.env.UPDATE_GOLDEN === "1") {
      writeFileSync(GOLDEN_PATH, `${JSON.stringify(summary, null, 2)}\n`);
      console.log("golden.json regenerated:", JSON.stringify(summary));
      return;
    }

    const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));
    expect(summary).toEqual(golden);
  }, 60_000);
});
