# Local hero images

Hero art is generated on your own machine — no API key, nothing leaves the box.
Same principle as `docs/LOCAL_MODELS.md`, different server: Ollama does vision,
not text-to-image, so images need their own runtime.

**The demo does not depend on this.** `IMAGE_PROVIDER` defaults to `svg`, a seeded
local render needing no GPU and no network. Every generator failure falls back to
it, so a post is never left without art mid-demo — and the activity log records
which provider actually served each image, so a silent fallback can't masquerade
as a GPU render.

## Quickstart — same three commands on Windows and macOS

```bash
pip install -r requirements-images.txt
npm run images:server        # first run downloads ~2.5 GB, then it's cached
npm run images:test          # renders one image per archetype
```

Then in `.env.local`:

```bash
IMAGE_PROVIDER=a1111
IMAGE_BASE_URL=http://127.0.0.1:7860
```

That's it. `scripts/image-server.py` picks its backend itself — **CUDA** on a
Windows/Linux NVIDIA box, **Metal (MPS)** on Apple Silicon, CPU otherwise. Same
command everywhere; no per-OS flags.

### Why not AUTOMATIC1111 or ComfyUI

You can use either (see below), but both install torch *and* a full web
application, extension system and model manager — around 10 GB — to expose the one
endpoint we call. The bundled server is ~150 lines over the same torch install
with a 2.5 GB model. It deliberately speaks A1111's `/sdapi/v1/txt2img` shape, so
`IMAGE_PROVIDER=a1111` points at either without a code change.

### The model

Default is **SD-Turbo** (`stabilityai/sd-turbo`): 2.5 GB, distilled to 1–4 steps,
native 512×512. Chosen because it is the smallest thing that still looks like a
photograph, and it is fast on a laptop GPU *and* tolerable on Apple Silicon.

| Machine | Expect |
|---|---|
| RTX 4060 8 GB (CUDA) | well under a second |
| Apple Silicon M-series (MPS) | a few seconds |
| CPU only | tens of seconds — fine for prewarming, not for clicking |

Swap it with `IMAGE_SERVER_MODEL`, e.g. `stabilityai/sdxl-turbo` (~7 GB, better,
needs the VRAM). Turbo/Lightning/LCM/Hyper models are detected by name and run
with guidance disabled, because a distilled model with CFG on produces washed-out
mush and its negative prompt is meaningless.

## Tuning

Defaults suit the bundled Turbo server: 512², 4 steps, low guidance.

```bash
IMAGE_STEPS=4          # 25-30 for a non-distilled checkpoint
IMAGE_WIDTH=512        # 1024 for SDXL — SDXL at 512 duplicates subjects
IMAGE_HEIGHT=512
IMAGE_CFG=2            # 6-7 for a non-distilled checkpoint
IMAGE_NEGATIVE=...     # overrides the default text/watermark/hands suppressor
IMAGE_TIMEOUT_MS=180000
```

## Using a full A1111 or ComfyUI instead

**A1111** — `--api` is not optional; without it the endpoint 404s.

- Windows/NVIDIA: `set COMMANDLINE_ARGS=--api --xformers --medvram`
- Apple Silicon: `./webui.sh --api --upcast-sampling --no-half-vae`
  (**not** `--xformers`, which is CUDA-only, and `--medvram` is pointless on
  unified memory)

**ComfyUI** — `IMAGE_PROVIDER=comfy`, `IMAGE_BASE_URL=http://127.0.0.1:8188`, and
`IMAGE_MODEL` must match the checkpoint filename exactly. The adapter posts a
minimal SDXL txt2img graph and polls `/history`.

With either, remember to move the tuning values to SDXL settings above.

## Prompting

`buildImagePrompt` writes comma-separated visual nouns and camera language, not
prose — diffusion models largely ignore instructions like "art direction: …",
which is what made the first attempt produce mush. Topic slugs are de-hyphenated,
a shared negative prompt suppresses text/watermarks/hands, and each archetype gets
its own look so a feed doesn't read as four crops of one stock photo:

- **education** — flat-lay knolling, overhead, soft diffused daylight
- **story** — candid documentary, hands in frame, golden hour, 35mm
- **meme** — bold graphic still life, saturated, hard light, seamless backdrop
- **product** — premium three-quarter hero, softbox, matte surface

## Regenerating the demo art

`public/generated/` is gitignored. After changing provider or model:

```bash
npx tsx scripts/build-demo.ts     # rebuilds demo-snapshot.db and its art
```
