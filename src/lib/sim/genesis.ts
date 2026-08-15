import { db } from "@/lib/db/client";
import {
  banditArms,
  personas,
  playbookRules,
  playbookVersions,
  settings,
  worlds,
} from "@/lib/db/schema";
import type { PersonaHidden, WorldConfig } from "@/lib/types";
import { ARCHETYPES, TIME_SLOTS } from "@/lib/types";
import { makeRng, subRng, type Rng } from "@/lib/rng";
import { logActivity } from "@/lib/agents/log";
import { randomUUID } from "node:crypto";

/**
 * NOTE (Track C → Track A): this is a deterministic stand-in for Task A1's
 * `generateWorld`, written so the C4 onboarding flow is usable end-to-end today.
 * A1 should replace the body — segment/persona derivation belongs in Track A and
 * will use the model registry. The signature and the hidden-ground-truth shape
 * are what C4 depends on; keep those stable.
 */

const SEGMENT_TEMPLATES = [
  { suffix: "enthusiasts", skew: "education" },
  { suffix: "pros", skew: "product" },
  { suffix: "operators", skew: "story" },
] as const;

const PERSONAS_PER_SEGMENT = 4;
const STOPWORDS = new Set([
  "the", "a", "an", "for", "and", "with", "that", "this", "your", "our", "you",
  "who", "are", "from", "into", "have", "has", "its", "it's", "to", "of", "in",
  "on", "at", "by", "is", "be", "as", "or",
]);

/** Content pillars mined from the product description, padded to a stable four. */
function deriveTopics(productDescription: string): string[] {
  const words = productDescription
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));

  const unique = [...new Set(words)].slice(0, 3);
  const topics = unique.map((w) => `${w}-deep-dive`);
  const padding = ["how-it-works", "customer-stories", "behind-the-build", "common-mistakes"];
  for (const pad of padding) {
    if (topics.length >= 4) break;
    topics.push(pad);
  }
  return topics.slice(0, 4);
}

function deriveSegments(productDescription: string): string[] {
  const head =
    productDescription
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .find((w) => w.length > 3 && !STOPWORDS.has(w)) ?? "product";
  return SEGMENT_TEMPLATES.map((t) => `${head}-${t.suffix}`);
}

function buildAffinity(segments: string[], rng: Rng): WorldConfig["affinity"] {
  const affinity: WorldConfig["affinity"] = {};
  segments.forEach((segment, i) => {
    const skew = SEGMENT_TEMPLATES[i % SEGMENT_TEMPLATES.length].skew;
    affinity[segment] = { education: 0, story: 0, meme: 0, product: 0 };
    for (const archetype of ARCHETYPES) {
      // hidden ground truth the agent must discover: one archetype per segment is
      // genuinely stronger, the rest are middling with a little jitter
      const base = archetype === skew ? 0.85 : 0.35;
      affinity[segment][archetype] = Math.min(1, Math.max(0, base + (rng() - 0.5) * 0.2));
    }
  });
  return affinity;
}

export interface GenesisInput {
  name: string;
  productDescription: string;
  seed?: string;
}

export function generateWorld(input: GenesisInput): { worldId: string; segments: string[]; topics: string[] } {
  const worldId = randomUUID();
  const seed = input.seed ?? `${input.name}:${input.productDescription}`.slice(0, 64);
  const rng = makeRng(seed);

  const segments = deriveSegments(input.productDescription);
  const topics = deriveTopics(input.productDescription);
  const config: WorldConfig = {
    affinity: buildAffinity(segments, rng),
    algo: {
      earlyVelocityBoost: 1.3,
      overPostPenalty: 0.6,
      maxOrganicReachPostsPerDay: 2,
      discoveryFloor: 10,
      discoveryRate: 0.15,
    },
    topics,
  };

  db.insert(worlds)
    .values({
      id: worldId,
      name: input.name,
      productDescription: input.productDescription,
      simTick: 0,
      seed,
      config,
      status: "active",
      createdAt: new Date(),
    })
    .run();
  db.insert(settings).values({ worldId, quietHours: [23, 6], bannedTopics: ["politics"] }).run();

  const slots = Object.keys(TIME_SLOTS) as (keyof typeof TIME_SLOTS)[];
  segments.forEach((segment, s) => {
    for (let i = 0; i < PERSONAS_PER_SEGMENT; i++) {
      const personaRng = subRng(seed, "persona", segment, i);
      const activeSlot = slots[(s + i) % slots.length];
      const hidden: PersonaHidden = {
        interests: [topics[(s + i) % topics.length], topics[(s + i + 1) % topics.length]],
        skepticism: 0.15 + personaRng() * 0.6,
        engagementPropensity: 0.3 + personaRng() * 0.5,
        purchaseIntent: 0.15 + personaRng() * 0.6,
        dmOpenness: 0.2 + personaRng() * 0.6,
        activeHours: TIME_SLOTS[activeSlot],
      };
      db.insert(personas)
        .values({
          id: randomUUID(),
          worldId,
          handle: `${segment}-${i}`,
          displayName: `${segment.replace(/-/g, " ")} ${i}`,
          bio: `${segment.replace(/-/g, " ")} — follows ${hidden.interests[0]}`,
          segment,
          hidden,
          isFollower: i === 0,
          fatigue: 0,
        })
        .run();
    }
  });

  // playbook v1: hypotheses, not conclusions — the agent has to earn the rest
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
    {
      ruleKey: "content-1",
      category: "content",
      text: `Hypothesis: education content wins with ${segments[0]}.`,
    },
    { ruleKey: "timing-1", category: "timing", text: "Hypothesis: mornings perform best." },
  ];
  for (const rule of seedRules) {
    db.insert(playbookRules)
      .values({
        id: randomUUID(),
        worldId,
        versionId,
        confidence: 0.4,
        evidence: { sourceType: "seed", refs: [] },
        ...rule,
      })
      .run();
  }

  for (const archetype of ARCHETYPES) {
    for (const timeSlot of slots) {
      db.insert(banditArms).values({ id: randomUUID(), worldId, archetype, timeSlot }).run();
    }
  }

  logActivity({
    worldId,
    tick: 0,
    actor: "system",
    action: "genesis",
    status: "ok",
    summary: `Grew ${segments.length * PERSONAS_PER_SEGMENT} personas across ${segments.length} segments`,
    detail: { segments, topics },
  });

  return { worldId, segments, topics };
}
