// Where hero images come from. Four providers behind one call, chosen by
// IMAGE_PROVIDER so the demo can run offline, on a local GPU, or on a cloud API
// without any caller knowing the difference.
//
//   svg     always available, zero deps, deterministic (the offline fallback)
//   a1111   Stable Diffusion WebUI --api on :7860  (simplest local REST)
//   comfy   ComfyUI on :8188                        (more control, graph API)
//   openai  gpt-image-1                             (needs a key)
//
// Anything that fails falls back to `svg` rather than leaving a post with no art,
// because a missing image is worse than a stylised one during a demo.

export type ImageProviderName = "svg" | "a1111" | "comfy" | "openai";

export interface GeneratedImage {
  bytes: Uint8Array;
  /** file extension without the dot */
  ext: string;
  provider: ImageProviderName;
}

export function imageProviderName(): ImageProviderName {
  const raw = (process.env.IMAGE_PROVIDER ?? "").trim().toLowerCase();
  if (raw === "a1111" || raw === "comfy" || raw === "openai" || raw === "svg") return raw;
  // no explicit choice: local text models imply a local box, but image generation
  // is a separate server that may not be running — svg stays the safe default
  return "svg";
}

export function imageBaseUrl(): string {
  const fallback = imageProviderName() === "comfy" ? "http://127.0.0.1:8188" : "http://127.0.0.1:7860";
  return (process.env.IMAGE_BASE_URL ?? fallback).replace(/\/$/, "");
}

/**
 * Defaults match the bundled server (`npm run images:server`, SD-Turbo): 512²,
 * 4 steps, low guidance. Running a full SDXL checkpoint through real A1111
 * instead? Set IMAGE_WIDTH/HEIGHT=1024, IMAGE_STEPS=28, IMAGE_CFG=6 — SDXL at
 * 512 produces the classic duplicated-subject artefact, and a Turbo model at
 * 28 steps with guidance produces mush.
 */
function tuning() {
  return {
    model: process.env.IMAGE_MODEL?.trim() || undefined,
    steps: Number(process.env.IMAGE_STEPS ?? 4),
    width: Number(process.env.IMAGE_WIDTH ?? 512),
    height: Number(process.env.IMAGE_HEIGHT ?? 512),
    cfg: Number(process.env.IMAGE_CFG ?? 2),
    sampler: process.env.IMAGE_SAMPLER?.trim() || "DPM++ 2M Karras",
    negative:
      process.env.IMAGE_NEGATIVE?.trim() ||
      "text, watermark, logo, signature, caption, letters, words, ugly, deformed, extra fingers, lowres, jpeg artifacts, oversaturated",
  };
}

/** Is the configured local server actually up? Used by the UI to explain itself. */
export async function probeImageServer(timeoutMs = 1500): Promise<boolean> {
  const provider = imageProviderName();
  if (provider !== "a1111" && provider !== "comfy") return false;
  const path = provider === "a1111" ? "/sdapi/v1/options" : "/system_stats";
  try {
    const res = await fetch(`${imageBaseUrl()}${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function decodeBase64(b64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(b64.replace(/^data:image\/\w+;base64,/, ""), "base64"));
}

async function generateA1111(prompt: string): Promise<GeneratedImage> {
  const t = tuning();
  const res = await fetch(`${imageBaseUrl()}/sdapi/v1/txt2img`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      negative_prompt: t.negative,
      steps: t.steps,
      width: t.width,
      height: t.height,
      cfg_scale: t.cfg,
      sampler_name: t.sampler,
      ...(t.model ? { override_settings: { sd_model_checkpoint: t.model } } : {}),
    }),
    // a cold model load plus 28 steps on a laptop GPU can genuinely take a minute
    signal: AbortSignal.timeout(Number(process.env.IMAGE_TIMEOUT_MS ?? 180_000)),
  });
  if (!res.ok) throw new Error(`a1111 HTTP ${res.status}`);
  const json = (await res.json()) as { images?: string[] };
  if (!json.images?.[0]) throw new Error("a1111 returned no image");
  return { bytes: decodeBase64(json.images[0]), ext: "png", provider: "a1111" };
}

/**
 * ComfyUI takes a workflow graph rather than a flat request, so this posts a
 * minimal SDXL txt2img graph and then polls history for the result.
 */
async function generateComfy(prompt: string): Promise<GeneratedImage> {
  const t = tuning();
  const base = imageBaseUrl();
  const clientId = `flywheel-${Date.now()}`;
  const ckpt = t.model || "sd_xl_base_1.0.safetensors";

  const graph = {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: ckpt } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["1", 1] } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: t.negative, clip: ["1", 1] } },
    "4": {
      class_type: "EmptyLatentImage",
      inputs: { width: t.width, height: t.height, batch_size: 1 },
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        seed: Math.floor(Date.now() % 2_000_000_000),
        steps: t.steps,
        cfg: t.cfg,
        sampler_name: "dpmpp_2m",
        scheduler: "karras",
        denoise: 1,
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
      },
    },
    "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
    "7": { class_type: "SaveImage", inputs: { filename_prefix: "flywheel", images: ["6", 0] } },
  };

  const queued = await fetch(`${base}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: graph, client_id: clientId }),
  });
  if (!queued.ok) throw new Error(`comfy queue HTTP ${queued.status}`);
  const { prompt_id: promptId } = (await queued.json()) as { prompt_id: string };

  const deadline = Date.now() + Number(process.env.IMAGE_TIMEOUT_MS ?? 180_000);
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1200));
    const hist = await fetch(`${base}/history/${promptId}`);
    if (!hist.ok) continue;
    const json = (await hist.json()) as Record<
      string,
      { outputs?: Record<string, { images?: { filename: string; subfolder: string; type: string }[] }> }
    >;
    const outputs = json[promptId]?.outputs;
    const image = outputs && Object.values(outputs).flatMap((o) => o.images ?? [])[0];
    if (!image) continue;
    const file = await fetch(
      `${base}/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(image.subfolder)}&type=${image.type}`,
    );
    if (!file.ok) throw new Error(`comfy view HTTP ${file.status}`);
    return {
      bytes: new Uint8Array(await file.arrayBuffer()),
      ext: "png",
      provider: "comfy",
    };
  }
  throw new Error("comfy timed out waiting for the image");
}

async function generateOpenAI(prompt: string): Promise<GeneratedImage> {
  const { generateImage } = await import("ai");
  const { openai } = await import("@ai-sdk/openai");
  const { image } = await generateImage({
    model: openai.image(process.env.MODEL_IMAGE ?? "gpt-image-1"),
    prompt,
    size: "1024x1024",
  });
  const ext = image.mediaType.includes("webp")
    ? "webp"
    : image.mediaType.includes("jpeg")
      ? "jpg"
      : "png";
  return { bytes: image.uint8Array, ext, provider: "openai" };
}

/**
 * Render `prompt`, or return null so the caller can fall back to the local SVG.
 * Never throws — an art failure must not fail the post.
 */
export async function generateImageBytes(
  prompt: string,
): Promise<{ image: GeneratedImage | null; error?: string }> {
  const provider = imageProviderName();
  if (provider === "svg") return { image: null };
  try {
    if (provider === "a1111") return { image: await generateA1111(prompt) };
    if (provider === "comfy") return { image: await generateComfy(prompt) };
    return { image: await generateOpenAI(prompt) };
  } catch (err) {
    return { image: null, error: err instanceof Error ? err.message : String(err) };
  }
}
