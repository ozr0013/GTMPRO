# Local hero images

Hero art is generated on your own machine — no API key, nothing leaves the box.
Same principle as `docs/LOCAL_MODELS.md`, different server: Ollama does vision,
not text-to-image, so images need their own runtime.

**The demo does not depend on this.** `IMAGE_PROVIDER` defaults to `svg`, a seeded
local render needing no GPU and no network. Every generator failure falls back to
it, so a post is never left without art mid-demo — and the activity log records
which provider actually served each image, so a silent fallback can't masquerade
as a GPU render.

## Quickstart

Make an isolated env first. `npm run images:server` prefers `.venv-images/` over
whatever `python` resolves to on PATH — on the machine this was built on, PATH
pointed at an unrelated project's virtualenv, so the server died with "No module
named torch" while torch was installed perfectly well somewhere else.

**macOS / Apple Silicon** — PyPI's Mac wheel already has Metal:

```bash
python3 -m venv .venv-images
.venv-images/bin/python -m pip install -r requirements-images.txt
```

**Windows / NVIDIA** — install the CUDA build *first*. PyPI's Windows wheel is
CPU-only; it imports fine and never errors, the GPU simply sits idle:

```bash
py -m venv .venv-images
.venv-images/Scripts/python -m pip install torch --index-url https://download.pytorch.org/whl/cu126
.venv-images/Scripts/python -m pip install -r requirements-images.txt
```

Then, on either:

```bash
npm run images:server        # first run downloads ~2.5 GB, then it's cached
npm run images:test          # renders one image per archetype
```

And in `.env.local`:

```bash
IMAGE_PROVIDER=a1111
IMAGE_BASE_URL=http://127.0.0.1:7860
```

`scripts/image-server.py` picks its backend itself — **CUDA** on an NVIDIA box,
**Metal (MPS)** on Apple Silicon, CPU otherwise — and prints the device it chose
on startup, so a silent CPU fallback shows up as a line of output rather than as
"why is this taking thirty seconds".

If pip says *no matching distribution found for torch* against a `cuXXX` index,
your Python is newer than that CUDA channel — wheels lag new Python releases by
months. On 3.14, `cu126` has builds and `cu121` does not. Try a later cu-number
or use Python 3.12.

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
needs the VRAM). Turbo/Lightning/LCM/Hyper models are detected by name and their
guidance is capped at `IMAGE_TURBO_CFG_MAX` (2.5), because a distilled model at
full CFG goes contrasty and plastic.

**Known limitation: pseudo-text on packaging.** Ask SD-Turbo for a bottle or a
tin and it will often paint a label bearing invented, garbled lettering. Two
things reduce it, and they are worth understanding before you try to "fix" it a
third way:

- The prompt never names the artefact. CLIP has no negation, so a positive
  prompt ending "no text, no logo" produces *more* text, not less — and even
  "blank label" put a garbled label on every bottle, because the model matched
  the noun and ignored the adjective.
- Guidance stays above 1 so the negative prompt actually executes. With
  classifier-free guidance off there is no second pass to steer, so at guidance
  0 the text/watermark suppressor is silently inert. Measured side by side on the
  same prompt, guidance 0 gives large garbled brand names; guidance 2 with the
  negative prompt live reduces them to faint marks.

Faint marks, not zero. If a run of product shots matters more than the 2.5 GB
footprint, `stabilityai/sdxl-turbo` at 1024² handles lettering markedly better.

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
