// Hero images for brand posts (Task C5).
//
// Mock mode AND the local provider render a deterministic seeded SVG (zero
// network, zero keys — D22); only the opt-in cloud provider calls a real image
// model, since Ollama has no image generation.

import { db } from "@/lib/db/client";
import { posts, settings, worlds } from "@/lib/db/schema";
import type { Archetype } from "@/lib/types";
import { subRng } from "@/lib/rng";
import { postStreamKey } from "@/lib/sim/streams";
import { isLocalProvider } from "./models";
import { logActivity } from "./log";
import { eq, and, isNotNull } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";

const OUTPUT_DIR = path.join(process.cwd(), "public", "generated");
const PUBLIC_PREFIX = "/generated";

export interface ImageBudget {
  used: number;
  total: number;
  remaining: number;
}

/**
 * The image ledger is derived from posts that already have an image rather than
 * decremented on a counter, so a retry after a failed write can never leak budget.
 *
 * NOTE (Track C → Track B): Task B4 owns `spendImageBudget`. This is a working
 * stand-in with the contract C5 needs; replace the body, keep the signature.
 */
export function getImageBudget(worldId: string): ImageBudget {
  const config = db.select().from(settings).where(eq(settings.worldId, worldId)).get();
  const total = config?.imageBudget ?? 0;
  const used = db
    .select()
    .from(posts)
    .where(and(eq(posts.worldId, worldId), isNotNull(posts.imageUrl)))
    .all().length;
  return { used, total, remaining: Math.max(total - used, 0) };
}

export function spendImageBudget(worldId: string): { allowed: boolean; remaining: number; reason?: string } {
  const budget = getImageBudget(worldId);
  if (budget.remaining <= 0) {
    return {
      allowed: false,
      remaining: 0,
      reason: `image budget exhausted (${budget.used}/${budget.total})`,
    };
  }
  return { allowed: true, remaining: budget.remaining - 1 };
}

export interface HeroImageResult {
  ok: boolean;
  imageUrl?: string;
  reason?: string;
}

/** Art direction prompt: the copywriter's brief plus house style, no caption text in-frame. */
export function buildImagePrompt(post: {
  archetype: string;
  topic: string;
  creativeBrief: string;
}): string {
  return [
    `Social media hero image for a ${post.archetype} post about ${post.topic}.`,
    `Art direction: ${post.creativeBrief}.`,
    "Clean editorial photography style, natural light, uncluttered composition,",
    "square crop, no text, no logos, no watermarks.",
  ].join(" ");
}

export async function generateHeroImage(postId: string): Promise<HeroImageResult> {
  const post = db.select().from(posts).where(eq(posts.id, postId)).get();
  if (!post) return { ok: false, reason: "post not found" };
  if (post.imageUrl) return { ok: true, imageUrl: post.imageUrl };
  if (post.authorType !== "brand") return { ok: false, reason: "ambient posts do not get hero images" };

  const world = db.select().from(worlds).where(eq(worlds.id, post.worldId)).get()!;
  const gate = spendImageBudget(post.worldId);
  if (!gate.allowed) {
    logActivity({
      worldId: post.worldId,
      tick: world.simTick,
      actor: "artdirector",
      action: "generate_image",
      status: "blocked",
      summary: `Hero image refused — ${gate.reason}`,
      refType: "post",
      refId: postId,
    });
    return { ok: false, reason: gate.reason };
  }

  const prompt = buildImagePrompt(post);
  let filename: string;
  let bytes: Uint8Array;

  try {
    // Mock mode has no network at all; local mode has an Ollama text server but no
    // image model. Both take the seeded local render, so the hero button works
    // keyless in every mode.
    if ((process.env.MODEL_MODE ?? "mock") === "mock" || isLocalProvider()) {
      filename = `${postId}.svg`;
      bytes = new TextEncoder().encode(
        // keyed on the post's stable stream key, not its UUID, so the same seeded
        // scenario renders byte-identical art and demo screenshots don't drift
        mockHeroSvg(post.archetype as Archetype, post.creativeBrief, world.seed, postStreamKey(post)),
      );
    } else {
      // imported lazily so mock mode never pulls the provider client into the process
      const { generateImage } = await import("ai");
      const { openai } = await import("@ai-sdk/openai");
      const { image } = await generateImage({
        model: openai.image(process.env.MODEL_IMAGE ?? "gpt-image-1"),
        prompt,
        size: "1024x1024",
      });
      filename = `${postId}.${extensionFor(image.mediaType)}`;
      bytes = image.uint8Array;
    }

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUTPUT_DIR, filename), bytes);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logActivity({
      worldId: post.worldId,
      tick: world.simTick,
      actor: "artdirector",
      action: "generate_image",
      status: "failed",
      summary: "Hero image generation failed — post keeps its placeholder art",
      refType: "post",
      refId: postId,
      detail: { error: reason },
    });
    return { ok: false, reason };
  }

  const imageUrl = `${PUBLIC_PREFIX}/${filename}`;
  db.update(posts).set({ imageUrl }).where(eq(posts.id, postId)).run();

  logActivity({
    worldId: post.worldId,
    tick: world.simTick,
    actor: "artdirector",
    action: "generate_image",
    status: "ok",
    summary: `Hero image generated (${gate.remaining} left in budget)`,
    refType: "post",
    refId: postId,
    detail: { prompt, imageUrl },
  });

  return { ok: true, imageUrl };
}

function extensionFor(mediaType: string): string {
  if (mediaType.includes("png")) return "png";
  if (mediaType.includes("webp")) return "webp";
  if (mediaType.includes("jpeg") || mediaType.includes("jpg")) return "jpg";
  return "png";
}

const MOCK_PALETTE: Record<Archetype, [string, string]> = {
  education: ["#38bdf8", "#34d399"],
  story: ["#a78bfa", "#fb7185"],
  meme: ["#fbbf24", "#fb7185"],
  product: ["#34d399", "#38bdf8"],
};

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === "'" ? "&apos;" : "&quot;",
  );
}

/** Wrap on word boundaries — SVG has no text flow. */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    if (current.length === 0) current = word;
    else if (`${current} ${word}`.length <= maxChars) current = `${current} ${word}`;
    else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) return lines;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

/**
 * Stand-in "generated" art: a seeded gradient composition rendering the creative
 * brief. Deterministic for a given world seed + post, so demo screenshots are stable.
 */
function mockHeroSvg(archetype: Archetype, brief: string, worldSeed: string, streamKey: string): string {
  const [from, to] = MOCK_PALETTE[archetype] ?? MOCK_PALETTE.education;
  const rng = subRng(worldSeed, "hero", streamKey);
  const angle = Math.round(rng() * 360);
  const blobs = Array.from({ length: 3 }, (_, i) => {
    const cx = Math.round(120 + rng() * 780);
    const cy = Math.round(120 + rng() * 780);
    const r = Math.round(140 + rng() * 220);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff" opacity="${0.06 + i * 0.04}" />`;
  }).join("");
  const lines = wrap(brief, 26, 4);
  const startY = 512 - ((lines.length - 1) * 58) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024" role="img" aria-label="${escapeXml(brief)}">
  <defs>
    <linearGradient id="g" gradientTransform="rotate(${angle} 0.5 0.5)">
      <stop offset="0%" stop-color="${from}" />
      <stop offset="100%" stop-color="${to}" />
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#g)" />
  ${blobs}
  <g font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="52" font-weight="600" fill="rgba(23,23,23,0.82)" text-anchor="middle">
${lines.map((line, i) => `    <text x="512" y="${startY + i * 58}">${escapeXml(line)}</text>`).join("\n")}
  </g>
  <text x="512" y="964" font-family="system-ui, sans-serif" font-size="26" fill="rgba(23,23,23,0.45)" text-anchor="middle">${escapeXml(archetype)} · studio card</text>
</svg>`;
}
