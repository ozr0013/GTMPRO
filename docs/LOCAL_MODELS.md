# Local models runbook (owner: Minh)

Goal: run Flywheel's entire live loop — strategist, copywriter, critic, analyst, coach, community, personas, genesis — on **free local models with zero API keys**, on every teammate's laptop including 12–16 GB machines.

The architecture's core claim survives the swap: actors and evaluators stay in **different model families** (self-preference-bias mitigation). Cloud mode is "Claude acts, GPT judges"; local mode is **"Qwen acts, Gemma judges."** The learning machinery (Thompson-sampling bandits, playbook versioning, calibration) is pure math and identical in both modes.

## 1. Pick your tier (check RAM first)

macOS: `system_profiler SPHardwareDataType | grep Memory` · Windows: Task Manager → Performance.

| Machine RAM | Actor (`MODEL_ACTOR_LOCAL`) | Judge (`MODEL_JUDGE_LOCAL`) | Cheap roles | Resident RAM |
|---|---|---|---|---|
| 32 GB | `qwen3:14b` | `gemma3:12b` | `qwen3:4b` | ~20 GB |
| 16 GB (default config) | `qwen3:8b` | `gemma3:4b` | shares judge | ~8.5 GB |
| 12 GB | `qwen3:4b` | `llama3.2:3b` | shares judge | ~5 GB |

Why these: **Qwen3** has the best JSON/instruction discipline per GB at laptop sizes (the Strategist/Coach structured outputs are the hard part) and is Apache-2.0. **Gemma 3** (Google) is a strong judge and a *different family* — that's non-negotiable for the evaluation story. On 12 GB, **Llama 3.2** (Meta) substitutes as the judge family. All are free for our use.

The cheap roles (persona voices, community DMs) intentionally default to the judge model so low-RAM machines keep only **two** models resident — this avoids constant model swapping, which is the real 16 GB killer.

### On a discrete GPU, size by VRAM — not system RAM

The table above reads correctly on Apple Silicon, where unified memory *is* the
budget. On a Windows/Linux box with an NVIDIA card the binding constraint is the
card, which is far smaller than system RAM — and picking a tier by RAM quietly
lands you on a model that cannot fit.

Nothing errors when it doesn't fit. Ollama offloads the overflow to CPU and
everything still works, just many times slower, which reads as "the app is
hanging" rather than "wrong model".

Measured on an RTX 4060 Laptop (8 GB VRAM, 32 GB system RAM), same world, same
heartbeat:

| Actor / judge | One heartbeat |
|---|---|
| `qwen3:14b` + `gemma3:12b` (the "32 GB" row, chosen by system RAM) | **404 s** |
| `qwen3:8b` + `gemma3:4b` (fits the card) | **74 s** |

So on a discrete GPU read the tier table as **VRAM**, and check with
`nvidia-smi --query-gpu=memory.total --format=csv`. A model needs roughly its
download size free; `qwen3:14b` is 8.6 GB and will not fit an 8 GB card at all.

Two things also compete for that VRAM and are easy to miss: the bundled image
server (`npm run images:server`) keeps Stable Diffusion resident even while
idle — worth stopping during live local-model work — and GPU-accelerated desktop
apps such as editors and browsers. `nvidia-smi` shows who is holding what, and
`ollama ps` shows what Ollama itself currently has loaded.

## 2. Install Ollama

- **macOS:** `brew install ollama && brew services start ollama` (or download Ollama.app from ollama.com and launch it)
- **Windows:** installer from ollama.com, or `winget install Ollama.Ollama`
- **Linux:** `curl -fsSL https://ollama.com/install.sh | sh`

Verify the server: `curl -s http://localhost:11434/v1/models` should return JSON.

## 3. Pull your tier's models

```bash
# 16 GB tier (most teammates)
ollama pull qwen3:8b && ollama pull gemma3:4b

# 12 GB tier
ollama pull qwen3:4b && ollama pull llama3.2:3b

# 32 GB tier
ollama pull qwen3:14b && ollama pull gemma3:12b && ollama pull qwen3:4b
```

Downloads are 2–9 GB per model; total 5–20 GB disk depending on tier.

## 4. Configure the repo

In `.env.local` (copy `.env.example` if you don't have one):

```bash
MODEL_MODE=live
MODEL_PROVIDER=local
# 16 GB tier can stop here — qwen3:8b / gemma3:4b are the code defaults.
# Other tiers, set explicitly:
#MODEL_ACTOR_LOCAL=qwen3:14b
#MODEL_JUDGE_LOCAL=gemma3:12b
#MODEL_CHEAP_LOCAL=qwen3:4b
```

No API keys needed. Code handles the rest automatically (routes all roles to Ollama's OpenAI-compatible endpoint, suppresses Qwen3's `<think>` blocks for clean JSON, runs judges at low temperature). Image generation is intentionally skipped in local mode — the feed uses the styled creative-brief cards.

## 5. Verify (in order)

```bash
ollama list                                   # your tier's models present
npm run smoke                                 # 3 × PASS against local models
npx tsx scripts/e2e-drive.ts                  # THE real test: full loop on local models
```

The e2e driver plays heartbeat → approve/reject → two sim days. Success looks like: proposals with real (non-"Mock") reasoning citing rule IDs, an outcome report, `arms with observations: ≥1`, playbook v2+ whose newest rule reads like an actual lesson from the data. Then open Mission Control and check `/brain` — the playbook should read like analysis, not canned text.

## 6. Expectations & tuning

- **Validated on M1 Max (2026-08-14):** full 2-day e2e (`scripts/e2e-drive.ts`) on qwen3:8b actor + gemma3:12b judge + qwen3:4b cheap ≈ **13–17 minutes**; live genesis ≈ 1–2 min; a heartbeat ≈ 30–90 s. The coach produced predicted-vs-actual lessons with rule citations; bandit observations recorded. qwen3:14b works too but roughly doubles actor latency — use 8b for stage pace, 14b for quality experiments.
- **Structured outputs are mandatory:** the provider is created with `supportsStructuredOutputs: true` (see `src/lib/agents/models.ts`) so Ollama decodes against the JSON schema. Without it, models free-form JSON and fail validation — if you see "response did not match schema" everywhere, you're on stale code.
- **Latency:** a sim-day advance takes ~1–4 minutes on local models (vs seconds in mock). Fine for dev and demo; `MODEL_MODE=mock` remains the instant fallback and is what all tests use.
- **Keep models warm for the demo:** `OLLAMA_KEEP_ALIVE=30m ollama serve` (or `launchctl setenv OLLAMA_KEEP_ALIVE 30m` before starting the app on macOS) so nothing reloads mid-presentation.
- **JSON hiccups are survivable by design:** a malformed output is retried once, then quarantined into the activity trail — the heartbeat never crashes. If you see frequent quarantines on the 12 GB tier, drop strategist temperature or move that machine to mock mode and let a 16/32 GB machine drive live demos.

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| `connection refused` on 11434 | `brew services restart ollama` (mac) / relaunch Ollama app |
| Sim-day advance extremely slow, fans loud | Wrong tier — check `ollama ps` for loaded model sizes; drop a tier. On a discrete GPU also check `nvidia-smi`: a model larger than VRAM silently offloads to CPU (see §1) |
| Heartbeat seems to hang, no error anywhere | Almost always the above — it is running, just slowly. Time one directly before assuming a bug |
| Out-of-memory / system freeze | Close browser tabs/Docker; use the 12 GB tier config |
| Frequent quarantined proposals in `/activity` | Model too small for the strategist schema — raise actor one tier |
| Models reload between every call | You overrode `MODEL_CHEAP_LOCAL` to a third model on a 16 GB machine — remove it |
| Smoke passes but e2e output looks garbled | Ensure the code's on latest `main` (`git pull`) — `<think>` suppression and judge temperature live in `src/lib/agents/models.ts` |

## Licenses

Qwen3: Apache-2.0 · Gemma 3: Google's Gemma Terms (free use, redistribution allowed) · Llama 3.2: Meta community license (free at our scale). All fine for a hackathon build and demo.
