import { describe, it, expect } from "vitest";
import { buildTinyWorld } from "./fixtures/world";
import { db } from "@/lib/db/client";
import { posts } from "@/lib/db/schema";
import { generateHeroImage, restoreMissingHeroFiles } from "@/lib/agents/artdirector";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function addPost(worldId: string, overrides: Partial<typeof posts.$inferInsert> = {}) {
  const id = overrides.id ?? randomUUID();
  db.insert(posts)
    .values({
      worldId,
      authorType: "brand",
      archetype: "education",
      topic: "brewing-science",
      caption: "A caption long enough to be real.",
      hashtags: ["#coldbrew"],
      creativeBrief: "Split-frame brew diagram showing water temperature",
      scheduledTick: 7,
      publishedTick: 7,
      status: "published",
      ...overrides,
      id,
    })
    .run();
  return id;
}

const fileFor = (imageUrl: string) =>
  path.join(process.cwd(), "public", imageUrl.replace(/^\//, ""));

describe("restoreMissingHeroFiles (clean-checkout repair)", () => {
  it("re-renders a missing svg byte-identical to the original", async () => {
    const { worldId } = buildTinyWorld("restore-seed");
    const postId = addPost(worldId);

    const result = await generateHeroImage(postId);
    const file = fileFor(result.imageUrl!);
    const original = fs.readFileSync(file, "utf8");

    // simulate the clean checkout: imageUrl row exists, file does not
    fs.rmSync(file);
    expect(fs.existsSync(file)).toBe(false);

    const { restored } = restoreMissingHeroFiles();
    expect(restored).toBeGreaterThanOrEqual(1);
    expect(fs.readFileSync(file, "utf8")).toEqual(original);
  });

  it("leaves existing files alone and skips non-svg renders", async () => {
    const { worldId } = buildTinyWorld("restore-skip");
    const svgPost = addPost(worldId);
    await generateHeroImage(svgPost);

    // a live-mode render (png) cannot be re-derived from the seed
    addPost(worldId, { imageUrl: "/generated/live-render-missing.png" });

    const { restored, skipped } = restoreMissingHeroFiles();
    expect(restored).toBe(0);
    expect(skipped).toBe(1);
  });
});
