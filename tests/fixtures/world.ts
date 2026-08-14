import { db } from "@/lib/db/client";
import {
  worlds,
  personas,
  settings,
  playbookVersions,
  playbookRules,
  banditArms,
} from "@/lib/db/schema";
import type { WorldConfig, PersonaHidden } from "@/lib/types";
import { ARCHETYPES } from "@/lib/types";
import { randomUUID } from "node:crypto";

const SEGMENTS = ["coffee-nerds", "busy-pros", "cafe-owners"] as const;

/**
 * Deterministic 12-persona world used by tests and the demo seed.
 * Track A's genesis pipeline (Task A1) generalizes this into src/lib/sim/build.ts.
 */
export function buildTinyWorld(seed = "test-seed"): { worldId: string } {
  const worldId = randomUUID();
  const config: WorldConfig = {
    affinity: {
      "coffee-nerds": { education: 0.9, story: 0.5, meme: 0.6, product: 0.4 },
      "busy-pros": { education: 0.4, story: 0.6, meme: 0.3, product: 0.7 },
      "cafe-owners": { education: 0.7, story: 0.4, meme: 0.2, product: 0.9 },
    },
    algo: {
      earlyVelocityBoost: 1.3,
      overPostPenalty: 0.6,
      maxOrganicReachPostsPerDay: 2,
      discoveryFloor: 10,
      discoveryRate: 0.15,
    },
    topics: ["brewing-science", "morning-routine", "cafe-economics", "bean-sourcing"],
  };
  db.insert(worlds)
    .values({
      id: worldId,
      name: "TestBrew",
      productDescription: "Cold brew concentrate for coffee obsessives",
      simTick: 0,
      seed,
      config,
      status: "active",
      createdAt: new Date(),
    })
    .run();
  db.insert(settings).values({ worldId, quietHours: [23, 6], bannedTopics: ["politics"] }).run();

  // 12 personas, 4 per segment, deterministic hidden state
  SEGMENTS.forEach((segment, s) => {
    for (let i = 0; i < 4; i++) {
      const hidden: PersonaHidden = {
        interests: [
          config.topics[(s + i) % config.topics.length],
          config.topics[(s + i + 1) % config.topics.length],
        ],
        skepticism: 0.2 + 0.15 * i,
        engagementPropensity: 0.4 + 0.12 * i,
        purchaseIntent: 0.25 + 0.15 * s,
        dmOpenness: 0.3 + 0.1 * i,
        activeHours: i % 2 === 0 ? [7, 8, 9, 12, 19] : [11, 12, 13, 18, 20],
      };
      db.insert(personas)
        .values({
          id: randomUUID(),
          worldId,
          handle: `${segment}-${i}`,
          displayName: `${segment} ${i}`,
          bio: `persona ${i} of ${segment}`,
          segment,
          hidden,
          isFollower: i === 0,
          fatigue: 0,
        })
        .run();
    }
  });

  // playbook v1 (seed hypotheses)
  const versionId = randomUUID();
  db.insert(playbookVersions)
    .values({
      id: versionId,
      worldId,
      version: 1,
      changeSummary: "Seed hypotheses",
      authorType: "seed",
      createdTick: 0,
    })
    .run();
  const seedRules = [
    { ruleKey: "voice-1", category: "voice", text: "Confident, warm, no hype words." },
    { ruleKey: "content-1", category: "content", text: "Hypothesis: education content wins with enthusiasts." },
    { ruleKey: "timing-1", category: "timing", text: "Hypothesis: mornings perform best." },
  ];
  for (const r of seedRules) {
    db.insert(playbookRules)
      .values({
        id: randomUUID(),
        worldId,
        versionId,
        confidence: 0.4,
        evidence: { sourceType: "seed", refs: [] },
        ...r,
      })
      .run();
  }

  // 12 bandit arms (4 archetypes x 3 time slots)
  for (const archetype of ARCHETYPES) {
    for (const timeSlot of ["morning", "midday", "evening"] as const) {
      db.insert(banditArms).values({ id: randomUUID(), worldId, archetype, timeSlot }).run();
    }
  }
  return { worldId };
}
