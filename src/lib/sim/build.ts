// World builder: turns a GenesisOutput into a fully seeded world (Track A owns).
//
// Deliberate deviation from the plan's Task A1 note: tests/fixtures/world.ts is NOT
// refactored to delegate here — its hand-written 12-persona topology anchors the
// existing deterministic tests. This builder is the genesis-scale generalization.

import { db } from "@/lib/db/client";
import {
  worlds,
  personas,
  settings,
  playbookVersions,
  playbookRules,
  banditArms,
} from "@/lib/db/schema";
import type { GenesisOutputT } from "@/lib/contracts";
import type { PersonaHidden, WorldConfig, TimeSlot } from "@/lib/types";
import { ARCHETYPES } from "@/lib/types";
import { subRng, pick } from "@/lib/rng";
import { randomUUID } from "node:crypto";

export interface BuildWorldOptions {
  productDescription: string;
  seed: string;
  name?: string;
}

const ACTIVE_HOUR_PATTERNS: number[][] = [
  [7, 8, 9, 12, 19], // morning-leaning
  [11, 12, 13, 18, 20], // midday-leaning
  [18, 19, 20, 21, 7], // evening-leaning
];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildWorldFromGenesis(
  genesis: GenesisOutputT,
  opts: BuildWorldOptions,
): { worldId: string } {
  const worldId = randomUUID();

  const affinity: WorldConfig["affinity"] = {};
  for (const segment of genesis.segments) {
    affinity[segment.name] = segment.affinity;
  }
  const config: WorldConfig = {
    affinity,
    ambient: genesis.ambientAccounts,
    algo: {
      earlyVelocityBoost: 1.3,
      overPostPenalty: 0.6,
      maxOrganicReachPostsPerDay: 2,
      discoveryFloor: 10,
      discoveryRate: 0.15,
    },
    topics: genesis.topics,
  };

  db.insert(worlds)
    .values({
      id: worldId,
      name: opts.name ?? genesis.brandName,
      productDescription: opts.productDescription,
      simTick: 0,
      seed: opts.seed,
      config,
      status: "active",
      createdAt: new Date(),
    })
    .run();
  db.insert(settings)
    .values({ worldId, quietHours: [23, 6], bannedTopics: ["politics"] })
    .run();

  for (const segment of genesis.segments) {
    const slug = slugify(segment.name);
    const followerCount = Math.max(1, Math.round(segment.size * 0.05));
    for (let j = 0; j < segment.size; j++) {
      const rng = subRng(opts.seed, "persona", segment.name, j);
      const interestPool = [...new Set([...segment.interests, ...genesis.topics])];
      const first = pick(rng, interestPool);
      const rest = interestPool.filter((t) => t !== first);
      const second = rest.length > 0 ? pick(rng, rest) : first;
      const hidden: PersonaHidden = {
        interests: [...new Set([first, second])],
        skepticism: 0.15 + 0.6 * rng(),
        engagementPropensity: 0.3 + 0.55 * rng(),
        purchaseIntent: 0.15 + 0.6 * rng(),
        dmOpenness: 0.2 + 0.5 * rng(),
        activeHours: pick(rng, ACTIVE_HOUR_PATTERNS),
      };
      db.insert(personas)
        .values({
          id: randomUUID(),
          worldId,
          handle: `${slug}-${j}`,
          displayName: `${segment.name} ${j}`,
          bio: `${segment.name} persona into ${hidden.interests.join(" and ")}`,
          segment: segment.name,
          hidden,
          isFollower: j < followerCount,
          fatigue: 0,
        })
        .run();
    }
  }

  const versionId = randomUUID();
  db.insert(playbookVersions)
    .values({
      id: versionId,
      worldId,
      version: 1,
      changeSummary: "Seed hypotheses from world genesis",
      authorType: "seed",
      createdTick: 0,
    })
    .run();
  genesis.seedRules.forEach((rule, i) => {
    db.insert(playbookRules)
      .values({
        id: randomUUID(),
        worldId,
        versionId,
        ruleKey: `seed-${i + 1}`,
        category: rule.category,
        text: rule.text,
        confidence: 0.4,
        evidence: { sourceType: "seed", refs: [] },
      })
      .run();
  });

  const timeSlots: TimeSlot[] = ["morning", "midday", "evening"];
  for (const archetype of ARCHETYPES) {
    for (const timeSlot of timeSlots) {
      db.insert(banditArms).values({ id: randomUUID(), worldId, archetype, timeSlot }).run();
    }
  }

  return { worldId };
}
