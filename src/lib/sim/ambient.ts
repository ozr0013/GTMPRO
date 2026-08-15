// Ambient/competitor content: feed noise from non-brand accounts (Track A owns).
//
// Standalone by design: no LLM calls, no engagement waves — ambient posts exist so the
// Pictogram feed doesn't consist solely of the brand's posts. Clock integration is a
// single call per tick once the orchestrator spine lands (Task A3 completes then).

import { db } from "@/lib/db/client";
import { posts, worlds } from "@/lib/db/schema";
import type { WorldConfig, Archetype } from "@/lib/types";
import { subRng, pick } from "@/lib/rng";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

const POSTABLE_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

const STYLE_TO_ARCHETYPE: Record<string, Archetype> = {
  meme: "meme",
  education: "education",
  product: "product",
};

const CAPTION_TEMPLATES: Record<Archetype, string[]> = {
  meme: [
    "Nobody: … Me at {hour}am thinking about {topic} again.",
    "POV: you brought up {topic} at brunch. Again.",
    "This is your sign to stop doomscrolling and go touch {topic}.",
  ],
  education: [
    "Quick explainer: what everyone gets wrong about {topic}.",
    "3 things we learned about {topic} this week.",
    "The data on {topic} is wild — thread in comments.",
  ],
  product: [
    "Restocked. You know what to do. #{topic}",
    "Our take on {topic}, now 15% off this week only.",
    "New drop for the {topic} people. Link in bio.",
  ],
  story: [
    "Behind the scenes of our {topic} experiment this week.",
    "A customer told us their {topic} story and honestly, we teared up.",
    "Year one of doing {topic} differently — a recap.",
  ],
};

/** Deterministic posting schedule: which hours this account posts on this sim-day. */
export function ambientScheduleFor(
  worldSeed: string,
  handle: string,
  day: number,
): number[] {
  const rng = subRng(worldSeed, "ambient", handle, day);
  const count = 2 + Math.floor(rng() * 3); // 2..4 posts per day
  const hours = new Set<number>();
  while (hours.size < count) {
    hours.add(pick(rng, POSTABLE_HOURS));
  }
  return [...hours].sort((a, b) => a - b);
}

/**
 * Publish ambient posts due at this tick. Returns the number of posts created.
 * Worlds without config.ambient (e.g. the tiny test fixture) produce none.
 */
export function generateAmbientPosts(worldId: string, tick: number): number {
  const world = db.select().from(worlds).where(eq(worlds.id, worldId)).get();
  if (!world) return 0;
  const config = world.config as WorldConfig;
  const accounts = config.ambient ?? [];
  if (accounts.length === 0) return 0;

  const day = Math.floor(tick / 24);
  const hour = tick % 24;
  let created = 0;

  for (const account of accounts) {
    const schedule = ambientScheduleFor(world.seed, account.handle, day);
    if (!schedule.includes(hour)) continue;

    const rng = subRng(world.seed, "ambient-post", account.handle, tick);
    const archetype = STYLE_TO_ARCHETYPE[account.postingStyle] ?? "story";
    const topic = pick(rng, config.topics);
    const caption = pick(rng, CAPTION_TEMPLATES[archetype])
      .replaceAll("{topic}", topic)
      .replaceAll("{hour}", String(((hour + 11) % 12) + 1));

    db.insert(posts)
      .values({
        id: randomUUID(),
        worldId,
        authorType: "ambient",
        ambientAuthor: account.handle,
        archetype,
        topic,
        caption,
        hashtags: [`#${topic.replaceAll(/[^a-z0-9]+/gi, "")}`],
        creativeBrief: `${account.postingStyle} visual from ${account.handle}`,
        scheduledTick: tick,
        publishedTick: tick,
        status: "published",
      })
      .run();
    created++;
  }
  return created;
}
