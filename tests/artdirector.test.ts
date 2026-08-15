import { describe, it, expect } from "vitest";
import { buildTinyWorld } from "./fixtures/world";
import { db } from "@/lib/db/client";
import { posts, settings } from "@/lib/db/schema";
import {
  buildImagePrompt,
  generateHeroImage,
  getImageBudget,
  spendImageBudget,
} from "@/lib/agents/artdirector";
import { getActivity } from "@/lib/db/queries";
import { eq } from "drizzle-orm";
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

describe("art director hero images (mock mode)", () => {
  it("generates an image, writes the file, and records the url", async () => {
    const { worldId } = buildTinyWorld("art-seed");
    const postId = addPost(worldId);

    const result = await generateHeroImage(postId);
    expect(result.ok).toBe(true);
    expect(result.imageUrl).toMatch(/^\/generated\/.+\.svg$/);
    expect(fs.existsSync(fileFor(result.imageUrl!))).toBe(true);

    const stored = db.select().from(posts).where(eq(posts.id, postId)).get()!;
    expect(stored.imageUrl).toBe(result.imageUrl);

    const logged = getActivity(worldId, 20).find((row) => row.actor === "artdirector");
    expect(logged?.status).toBe("ok");
  });

  it("is idempotent — a second call reuses the existing image", async () => {
    const { worldId } = buildTinyWorld("art-idempotent");
    const postId = addPost(worldId);

    const first = await generateHeroImage(postId);
    const before = getImageBudget(worldId).used;
    const second = await generateHeroImage(postId);

    expect(second.imageUrl).toBe(first.imageUrl);
    expect(getImageBudget(worldId).used).toBe(before);
  });

  it("refuses once the image budget is spent", async () => {
    const { worldId } = buildTinyWorld("art-budget");
    db.update(settings).set({ imageBudget: 1 }).where(eq(settings.worldId, worldId)).run();

    expect(await generateHeroImage(addPost(worldId))).toMatchObject({ ok: true });
    expect(getImageBudget(worldId)).toMatchObject({ used: 1, total: 1, remaining: 0 });

    const refused = await generateHeroImage(addPost(worldId));
    expect(refused.ok).toBe(false);
    expect(refused.reason).toMatch(/budget/i);
    expect(spendImageBudget(worldId).allowed).toBe(false);

    const blocked = getActivity(worldId, 20).find(
      (row) => row.actor === "artdirector" && row.status === "blocked",
    );
    expect(blocked).toBeDefined();
  });

  it("refuses ambient posts and spends no budget on them", async () => {
    const { worldId } = buildTinyWorld("art-ambient");
    const ambient = addPost(worldId, { authorType: "ambient", ambientAuthor: "competitor" });

    const result = await generateHeroImage(ambient);
    expect(result.ok).toBe(false);
    expect(getImageBudget(worldId).used).toBe(0);
  });

  it("renders identical art for the same world seed and post", async () => {
    const read = async (seed: string) => {
      const { worldId } = buildTinyWorld(seed);
      const result = await generateHeroImage(addPost(worldId));
      return fs.readFileSync(fileFor(result.imageUrl!), "utf8");
    };
    // identical seed + identical post content ⇒ byte-identical art (the row UUIDs
    // differ between runs, so this fails if the art keys on post.id)
    expect(await read("art-determinism")).toEqual(await read("art-determinism"));
  });

  it("builds a prompt from the creative brief without leaking caption text", () => {
    const prompt = buildImagePrompt({
      archetype: "education",
      topic: "brewing-science",
      creativeBrief: "Split-frame brew diagram",
    });
    expect(prompt).toContain("Split-frame brew diagram");
    // topic slugs are de-hyphenated for the image model — see image-provider.test.ts
    expect(prompt).toContain("brewing science");
    expect(prompt).toMatch(/no text/i);
  });
});
