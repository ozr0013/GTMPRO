// Task C5: build a demo world, drive it through the demo path, generate hero
// images, then snapshot the DB so the demo can run offline if live mode misbehaves.
//
// Usage:
//   npm run prewarm            # mock mode — no keys, deterministic, safe default
//   MODEL_MODE=live npm run prewarm
//
// Writes ./demo-snapshot.db (committed) plus public/generated/* (gitignored —
// regenerate with this script rather than committing binaries).

import fs from "node:fs";
import path from "node:path";

// DB_PATH must be set before anything imports the db client, which opens the
// file at module load.
const SNAPSHOT = path.resolve(process.cwd(), "demo-snapshot.db");
process.env.DB_PATH = SNAPSHOT;

async function main() {
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(`${SNAPSHOT}${suffix}`, { force: true });
  }

  const { generateWorld } = await import("../src/lib/sim/genesis");
  const { runHeartbeat, decideProposal } = await import("../src/lib/agents/orchestrator");
  const { advanceTicks } = await import("../src/lib/sim/clock");
  const { generateHeroImage, getImageBudget } = await import("../src/lib/agents/artdirector");
  const { getWorld, getFeed, getFunnelSummary, getPendingProposals } = await import(
    "../src/lib/db/queries"
  );
  const { db } = await import("../src/lib/db/client");
  const { proposals } = await import("../src/lib/db/schema");
  const { eq, and } = await import("drizzle-orm");

  const mode = process.env.MODEL_MODE ?? "mock";
  console.log(`Prewarming demo snapshot in ${mode} mode → ${SNAPSHOT}`);

  const { worldId, segments } = await generateWorld(
    "Cold brew concentrate for coffee obsessives who care about extraction",
    { name: "TestBrew", seed: "demo-prewarm" },
  );
  console.log(`  world ${worldId} · segments: ${segments.join(", ")}`);

  // Seed the first proposal; from here the clock's own tick-7 heartbeat supplies
  // the rest, so each day we just decide whatever is waiting.
  await runHeartbeat(worldId);

  // Day 2 rejects with a reason so the snapshot carries the "human feedback changes
  // the next proposal" beat the demo leans on. Proposals expire after 48 ticks, so
  // deciding once per sim day is comfortably inside the window.
  const DAYS = 4;
  for (let day = 1; day <= DAYS; day++) {
    const pending = getPendingProposals(worldId);
    let approved = 0;
    let rejected = 0;
    for (const [i, proposal] of pending.entries()) {
      if (day === 2 && i === 0) {
        await decideProposal(proposal.id, "reject", {
          reason: "Too product-forward — lead with the insight, not the product.",
        });
        rejected++;
      } else {
        await decideProposal(proposal.id, "approve");
        approved++;
      }
    }
    console.log(`  day ${day}: ${approved} approved, ${rejected} rejected`);
    await advanceTicks(worldId, 24);
  }

  // Hero images for the brand's own published posts, up to the image budget.
  // Ambient competitor posts are feed noise and never get art directed.
  const brandPosts = getFeed(worldId).filter((p) => p.authorType === "brand");
  for (const post of brandPosts) {
    const budget = getImageBudget(worldId);
    if (budget.remaining <= 0) {
      console.log(`  image budget exhausted (${budget.used}/${budget.total}) — stopping`);
      break;
    }
    const result = await generateHeroImage(post.id);
    console.log(
      result.ok
        ? `  hero image ${result.imageUrl}`
        : `  hero image FAILED for ${post.id.slice(0, 8)}: ${result.reason}`,
    );
  }

  const world = getWorld(worldId)!;
  const funnel = getFunnelSummary(worldId);
  const rejected = db
    .select()
    .from(proposals)
    .where(and(eq(proposals.worldId, worldId), eq(proposals.status, "rejected")))
    .all().length;

  console.log("\nSnapshot ready:");
  console.log(`  ${world.simLabel} · playbook v${world.playbookVersion} · ${world.followers} followers`);
  const feed = getFeed(worldId);
  console.log(
    `  ${feed.filter((p) => p.authorType === "brand").length} brand posts published ` +
      `(+${feed.filter((p) => p.authorType === "ambient").length} ambient), ${rejected} rejected`,
  );
  console.log(`  funnel: ${funnel.map((s) => `${s.stage} ${s.count}`).join(" → ")}`);
  console.log(`\nRun the demo from it with:  DB_PATH=./demo-snapshot.db npm run dev`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
