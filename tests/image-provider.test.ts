import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  generateImageBytes,
  imageBaseUrl,
  imageProviderName,
} from "@/lib/agents/imageProvider";
import { buildImagePrompt } from "@/lib/agents/artdirector";

const KEYS = ["IMAGE_PROVIDER", "IMAGE_BASE_URL", "IMAGE_TIMEOUT_MS"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("provider selection", () => {
  it("defaults to the offline svg renderer", () => {
    // the demo must never depend on a GPU server being up
    expect(imageProviderName()).toBe("svg");
  });

  it("accepts the known providers and ignores nonsense", () => {
    for (const p of ["a1111", "comfy", "openai", "svg"]) {
      process.env.IMAGE_PROVIDER = p;
      expect(imageProviderName()).toBe(p);
    }
    process.env.IMAGE_PROVIDER = "midjourney";
    expect(imageProviderName()).toBe("svg");
  });

  it("picks the right default port per provider", () => {
    process.env.IMAGE_PROVIDER = "a1111";
    expect(imageBaseUrl()).toContain(":7860");
    process.env.IMAGE_PROVIDER = "comfy";
    expect(imageBaseUrl()).toContain(":8188");
  });

  it("strips a trailing slash so paths do not double up", () => {
    process.env.IMAGE_PROVIDER = "a1111";
    process.env.IMAGE_BASE_URL = "http://127.0.0.1:7860/";
    expect(imageBaseUrl()).toBe("http://127.0.0.1:7860");
  });
});

describe("failure never blocks a post", () => {
  it("returns no image and no throw when svg is selected", async () => {
    const result = await generateImageBytes("anything");
    expect(result.image).toBeNull();
    expect(result.error).toBeUndefined();
  });

  it("reports the error instead of throwing when the server is down", async () => {
    process.env.IMAGE_PROVIDER = "a1111";
    // nothing is listening here, and the caller must still get a usable result
    process.env.IMAGE_BASE_URL = "http://127.0.0.1:9";
    process.env.IMAGE_TIMEOUT_MS = "1500";
    const result = await generateImageBytes("a cup of coffee");
    expect(result.image).toBeNull();
    expect(result.error).toBeTruthy();
  }, 20_000);
});

describe("prompt is written for a diffusion model", () => {
  const post = {
    archetype: "product",
    topic: "cold-brew-ratios",
    creativeBrief: "A bottle of cold brew concentrate beside a measuring jug",
  };

  it("leads with the subject and keeps the topic readable", () => {
    const prompt = buildImagePrompt(post);
    expect(prompt.startsWith(post.creativeBrief)).toBe(true);
    // hyphens in a topic slug read badly to an image model
    expect(prompt).toContain("cold brew ratios");
    expect(prompt).not.toContain("cold-brew-ratios");
  });

  it("suppresses text in-frame, which diffusion models otherwise hallucinate", () => {
    expect(buildImagePrompt(post)).toContain("no text");
  });

  it("gives each archetype a distinct look so a feed is not four of the same photo", () => {
    const product = buildImagePrompt(post);
    const meme = buildImagePrompt({ ...post, archetype: "meme" });
    const story = buildImagePrompt({ ...post, archetype: "story" });
    expect(product).not.toEqual(meme);
    expect(meme).not.toEqual(story);
    expect(product).toContain("product photograph");
    expect(story).toContain("documentary");
  });

  it("falls back to a known style for an unrecognised archetype", () => {
    expect(buildImagePrompt({ ...post, archetype: "nonsense" })).toContain("flat-lay");
  });
});
