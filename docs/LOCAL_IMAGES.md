# Local hero images

Hero art is generated on your own GPU — no API key, nothing leaves the machine.
Same principle as `docs/LOCAL_MODELS.md`, different server: Ollama does vision, not
text-to-image, so image generation needs Stable Diffusion running separately.

**The demo does not depend on this.** `IMAGE_PROVIDER` defaults to `svg`, a seeded
local render that needs no GPU and no network. Every generator failure falls back
to it, so a post is never left without art mid-demo.

## Which model, on which GPU

Measured target: RTX 4060 Laptop, **8 GB VRAM**.

| VRAM | Checkpoint | Steps | CFG | Speed |
|---|---|---|---|---|
| 6–8 GB | **SDXL-Turbo** or a Lightning/Hyper SDXL merge | 6–8 | ~2 | ~2–4 s |
| 8–12 GB | **SDXL base 1.0** | 25–30 | 6 | ~15–25 s |
| 4–6 GB | SD 1.5 (`--medvram`) | 25 | 7 | ~5 s |

Hero images are pre-generated into the snapshot rather than made live on stage, so
prefer quality over speed: **SDXL base at 28 steps** is the default here. Drop to a
Turbo merge if you are iterating a lot.

## Option A — Stable Diffusion WebUI (simplest API)

```bash
git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui C:\sd-webui
```

Edit `webui-user.bat`:

```bat
set COMMANDLINE_ARGS=--api --xformers --medvram
```

Run `webui-user.bat`. First launch installs torch and downloads a base model
(~10 GB, 10–20 min). Put any extra `.safetensors` in `models\Stable-diffusion\`.

Then in `.env.local`:

```bash
IMAGE_PROVIDER=a1111
IMAGE_BASE_URL=http://127.0.0.1:7860
#IMAGE_MODEL=sd_xl_base_1.0.safetensors   # omit to use whatever is loaded
```

`--api` is not optional — without it `/sdapi/v1/txt2img` returns 404.

## Option B — ComfyUI

Download the portable build, drop a checkpoint in `models/checkpoints/`, run it,
then:

```bash
IMAGE_PROVIDER=comfy
IMAGE_BASE_URL=http://127.0.0.1:8188
IMAGE_MODEL=sd_xl_base_1.0.safetensors    # must match the filename exactly
```

The adapter posts a minimal SDXL txt2img graph and polls `/history`. If you use a
non-SDXL checkpoint the graph still works, but set `IMAGE_WIDTH/HEIGHT` to 512 for
SD 1.5 — rendering it at 1024 produces the classic duplicated-subject artefact.

## Verify

```bash
npm run images:test        # renders one image per archetype into public/generated/
```

It prints the provider actually used. If it says `svg` while you expected `a1111`,
the server is not reachable — the run does not fail, it falls back, and the reason
is printed and written to the activity log.

## Prompting

`buildImagePrompt` writes comma-separated visual nouns and camera language, not
prose — diffusion models largely ignore instructions like "art direction: ...",
which is what made the first version produce mush. Each archetype gets its own
look so a feed does not read as four crops of one stock photo:

- **education** — flat-lay knolling, overhead, soft diffused daylight
- **story** — candid documentary, hands in frame, golden hour, 35mm
- **meme** — bold graphic still life, saturated, hard light, seamless backdrop
- **product** — premium three-quarter hero, softbox, matte surface

A shared negative prompt suppresses text, watermarks and hands, since diffusion
models hallucinate all three. Override with `IMAGE_NEGATIVE`.

## Regenerating the demo art

`public/generated/` is gitignored. After changing provider or model:

```bash
npx tsx scripts/build-demo.ts     # rebuilds demo-snapshot.db and its art
```
