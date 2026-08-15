// End-to-end loop driver (mock mode): plays a realistic session against the
// current DB so the UI has rich state and the full reason->action->evaluation->
// improvement cycle is observable. Safe to re-run; also used for demo prep.
//
//   npx tsx scripts/e2e-drive.ts

import { db } from "@/lib/db/client";
import {
  worlds,
  posts,
  engagements,
  funnelEvents,
  dmThreads,
  proposals,
  playbookVersions,
  playbookRules,
  banditArms,
  activityLog,
} from "@/lib/db/schema";
import { runHeartbeat, decideProposal } from "@/lib/agents/orchestrator";
import { advanceTicks } from "@/lib/sim/clock";
import { generateWorld } from "@/lib/sim/genesis";
import { eq, and, desc } from "drizzle-orm";

function count<T extends { kind?: string | null }>(rows: T[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const k = row.kind ?? "?";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

async function main() {
  let world = db.select().from(worlds).where(eq(worlds.status, "active")).get();
  if (!world) {
    console.log("No world found — running genesis…");
    const { worldId } = await generateWorld("Cold brew concentrate for coffee obsessives", {
      seed: "e2e-seed",
      name: "TestBrew",
    });
    world = db.select().from(worlds).where(eq(worlds.id, worldId)).get()!;
  }
  const worldId = world.id;
  console.log(`World: ${world.name} (${worldId.slice(0, 8)}…) tick=${world.simTick}`);

  console.log("\n[1] Heartbeat — strategist proposes…");
  const { proposalIds } = await runHeartbeat(worldId);
  const pending = db
    .select()
    .from(proposals)
    .where(and(eq(proposals.worldId, worldId), eq(proposals.status, "pending")))
    .all();
  console.log(`    proposals created: ${proposalIds.length}; pending now: ${pending.length}`);
  for (const p of pending.slice(0, 3)) {
    console.log(`    - [${p.kind}] ${p.reasoning.slice(0, 90)}`);
  }

  if (pending[0]) {
    console.log("\n[2] Human approves the first proposal…");
    await decideProposal(pending[0].id, "approve");
  }
  if (pending[1]) {
    console.log("[2b] Human rejects the second with a reason…");
    await decideProposal(pending[1].id, "reject", {
      reason: "Too promotional — we lead with education, not product pushes.",
    });
  }

  console.log("\n[3] Advancing 24 ticks (sim day 1: publish, engage, funnel, analyst, coach)…");
  await advanceTicks(worldId, 24);
  console.log("[4] Advancing 24 more (day 2 incl. morning heartbeat on the NEW playbook)…");
  await advanceTicks(worldId, 24);

  const brand = db.select().from(posts).where(and(eq(posts.worldId, worldId), eq(posts.authorType, "brand"))).all();
  const ambient = db.select().from(posts).where(and(eq(posts.worldId, worldId), eq(posts.authorType, "ambient"))).all();
  const eng = db.select().from(engagements).where(eq(engagements.worldId, worldId)).all();
  const funnel = db.select().from(funnelEvents).where(eq(funnelEvents.worldId, worldId)).all();
  const threads = db.select().from(dmThreads).where(eq(dmThreads.worldId, worldId)).all();
  const versions = db
    .select()
    .from(playbookVersions)
    .where(eq(playbookVersions.worldId, worldId))
    .orderBy(desc(playbookVersions.version))
    .all();
  const rules = db
    .select()
    .from(playbookRules)
    .where(and(eq(playbookRules.worldId, worldId), eq(playbookRules.versionId, versions[0].id)))
    .all();
  const arms = db
    .select()
    .from(banditArms)
    .where(eq(banditArms.worldId, worldId))
    .all()
    .map((a) => ({ arm: `${a.archetype}/${a.timeSlot}`, mean: (a.alpha / (a.alpha + a.beta)).toFixed(2), n: a.alpha + a.beta - 4 }))
    .sort((a, b) => Number(b.mean) - Number(a.mean));
  const allProposals = db.select().from(proposals).where(eq(proposals.worldId, worldId)).all();
  const actors = [...new Set(db.select().from(activityLog).where(eq(activityLog.worldId, worldId)).all().map((l) => l.actor))];

  console.log("\n===== E2E SUMMARY =====");
  console.log(`posts: brand=${brand.length} ambient=${ambient.length}`);
  console.log(`engagements: ${JSON.stringify(count(eng))}`);
  console.log(`funnel: ${JSON.stringify(count(funnel))}`);
  console.log(`dm threads: ${threads.length} (${threads.map((t) => t.status).join(", ") || "none"})`);
  console.log(`proposals by status: ${JSON.stringify(count(allProposals.map((p) => ({ kind: p.status }))))}`);
  console.log(`playbook: v${versions[0].version} (${versions.length} versions) — latest: "${versions[0].changeSummary}"`);
  console.log(`   rules now: ${rules.length}; newest: "${rules[rules.length - 1]?.text.slice(0, 80)}"`);
  const observed = arms.filter((a) => a.n > 0);
  console.log(`top bandit arms: ${arms.slice(0, 3).map((a) => `${a.arm} mean=${a.mean} n=${a.n}`).join(" | ")}`);
  console.log(
    `arms with observations: ${observed.length > 0 ? observed.map((a) => `${a.arm} mean=${a.mean} n=${a.n}`).join(" | ") : "none yet"}`,
  );
  console.log(`activity actors seen: ${actors.join(", ")}`);

  const world2 = db.select().from(worlds).where(eq(worlds.id, worldId)).get()!;
  console.log(`\nWorld tick now: ${world2.simTick} (Day ${Math.floor(world2.simTick / 24) + 1})`);
  console.log("Open http://localhost:3001 to explore this state in Mission Control.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
