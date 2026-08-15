// Hero images for brand posts (Task C5).
//
// Live mode calls the image model; mock mode renders a deterministic local SVG so
// the constraint "MODEL_MODE=mock runs the complete loop with zero network calls"
// still holds and the demo works offline.

import { db } from "@/lib/db/client";
import { posts, settings, worlds } from "@/lib/db/schema";
import type { Archetype } from "@/lib/types";
import { subRng } from "@/lib/rng";
import { postStreamKey } from "@/lib/sim/streams";
import { generateImageBytes } from "./imageProvider";
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
  /** which generator actually produced it — "svg" means the fallback ran */
  provider?: string;
  /** set when a real generator was configured but failed, and svg stood in */
  providerError?: string;
}

/**
 * Diffusion models respond to comma-separated visual nouns and camera language,
 * not to prose instructions — "Art direction: ..." mostly gets ignored, which is
 * why the earlier prompt produced mush. Lead with the subject, then the shot,
 * then the light, then quality terms.
 *
 * Each archetype gets its own look so a feed of four posts does not read as four
 * variations of one stock photo.
 */
const ARCHETYPE_STYLE: Record<string, string> = {
  education:
    "clean flat-lay knolling composition, overhead shot, soft diffused daylight, muted neutral background, shallow depth of field",
  story:
    "candid documentary photograph, human hands in frame, warm golden-hour window light, lived-in setting, 35mm",
  meme: "bold graphic still life, single hero subject, punchy saturated colour, hard directional light, seamless colour backdrop",
  // "single centred subject" earns its place: at 512² this archetype otherwise
  // tends to compose a diptych — two half-frames of near-identical packaging.
  product:
    "premium product photograph, single centred subject, three-quarter hero angle, soft box lighting with gentle reflections, matte surface, minimal props",
};

const QUALITY = "sharp focus, high detail, professional colour grading, editorial photography, 4k";

/**
 * Keeps lettering out of frame — stated as what we want, never as "no text".
 *
 * CLIP does not encode negation. Ending the prompt with "no text, no watermark,
 * no logo" puts the tokens *text*, *watermark* and *logo* in front of the model
 * with no operator to cancel them, so it reliably paints exactly those: the
 * product renders came back wearing garbled invented brand names.
 *
 * The negative prompt is not a way out here. A distilled Turbo/LCM checkpoint
 * runs at guidance 0, and with no classifier-free guidance there is no second
 * pass for the negative prompt to steer — the bundled server drops it outright.
 * The bundled server now honours a modest guidance (>1) on Turbo checkpoints so
 * the negative prompt runs again — but this stays the first line of defence,
 * since a caller can still be at guidance 0.
 *
 * Note what is *absent*: no "label", no "logo", no "text", not even inside a
 * phrase meant to forbid them. "blank label" put a garbled label on every
 * bottle; the model matched the noun and ignored the adjective.
 */
const UNBRANDED = "plain unmarked matte surfaces, smooth clean finish";

/** Art direction prompt: the copywriter's brief plus house style, no caption text in-frame. */
export function buildImagePrompt(post: {
  archetype: string;
  topic: string;
  creativeBrief: string;
}): string {
  const subject = post.creativeBrief.replace(/\s+/g, " ").trim();
  const style = ARCHETYPE_STYLE[post.archetype] ?? ARCHETYPE_STYLE.education;
  const topic = post.topic.replace(/-/g, " ");
  return [subject, topic, style, QUALITY, UNBRANDED].join(", ");
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
  let usedProvider: string = "svg";
  let providerError: string | undefined;

  try {
    // Try the configured generator first; `svg` short-circuits with no network.
    const { image, error } = await generateImageBytes(prompt);
    providerError = error;

    if (image) {
      filename = `${postId}.${image.ext}`;
      bytes = image.bytes;
      usedProvider = image.provider;
    } else {
      // Fallback, and the offline default: a seeded local render. Keyed on the
      // post's stable stream key rather than its UUID so the same scenario draws
      // byte-identical art and demo screenshots do not drift.
      filename = `${postId}.svg`;
      bytes = new TextEncoder().encode(
        mockHeroSvg(post.archetype as Archetype, post.creativeBrief, world.seed, postStreamKey(post)),
      );
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
    // name the provider: silently falling back to the placeholder while the
    // operator believes a GPU is rendering is the confusing failure here
    summary: providerError
      ? `Hero image fell back to placeholder — ${providerError}`
      : `Hero image generated via ${usedProvider} (${gate.remaining} left in budget)`,
    refType: "post",
    refId: postId,
    detail: { prompt, imageUrl, provider: usedProvider, providerError },
  });

  return { ok: true, imageUrl, provider: usedProvider, providerError };
}

// (media-type -> extension now lives in imageProvider, next to the fetch that needs it)

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
  <text x="512" y="964" font-family="system-ui, sans-serif" font-size="26" fill="rgba(23,23,23,0.45)" text-anchor="middle">${escapeXml(archetype)} · mock hero</text>
</svg>`;
}
