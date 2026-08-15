// Validates all four models before live mode. Run: npm run smoke
// AI SDK v7: image generation is the stable `generateImage` export
// (the old `experimental_generateImage` alias no longer exists).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateImage, generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";

/** Minimal .env.local loader (no deps). Already-set env vars win; provider
 * clients read keys lazily per request, so loading here is early enough. */
function loadEnvLocal(): void {
  let raw: string;
  try {
    raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  } catch {
    return; // no .env.local — ambient env only
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
      value = value.slice(1, -1);
    } else {
      // strip inline comments from unquoted values (.env.example uses them)
      const hash = value.indexOf("#");
      if (hash !== -1) value = value.slice(0, hash).trim();
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main() {
  loadEnvLocal();

  let checks: [string, () => Promise<unknown>][];
  if ((process.env.MODEL_PROVIDER ?? "cloud") === "local") {
    // Local (Ollama) mode: three text models, no image model (feed uses placeholder
    // creative cards by design). Setup runbook: docs/LOCAL_MODELS.md
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const local = createOpenAICompatible({
      name: "ollama",
      baseURL: process.env.LOCAL_BASE_URL ?? "http://localhost:11434/v1",
      supportsStructuredOutputs: true,
    });
    const actor = process.env.MODEL_ACTOR_LOCAL ?? "qwen3:8b";
    const judge = process.env.MODEL_JUDGE_LOCAL ?? "gemma3:4b";
    const cheap = process.env.MODEL_CHEAP_LOCAL ?? judge;
    checks = [
      [`local actor (${actor})`, () => generateText({ model: local(actor), prompt: "Say OK" })],
      [`local judge (${judge})`, () => generateText({ model: local(judge), prompt: "Say OK" })],
      [`local cheap (${cheap})`, () => generateText({ model: local(cheap), prompt: "Say OK" })],
    ];
    console.log("MODEL_PROVIDER=local — checking Ollama models (image generation: skipped, placeholders by design)");
  } else {
    checks = [
      [
        "anthropic actor",
        () => generateText({ model: anthropic(process.env.MODEL_ACTOR ?? "claude-sonnet-4-5"), prompt: "Say OK" }),
      ],
      [
        "openai judge",
        () => generateText({ model: openai(process.env.MODEL_JUDGE ?? "gpt-5"), prompt: "Say OK" }),
      ],
      [
        "openai cheap",
        () => generateText({ model: openai(process.env.MODEL_CHEAP ?? "gpt-5-mini"), prompt: "Say OK" }),
      ],
      [
        "image model",
        () =>
          generateImage({
            model: openai.image(process.env.MODEL_IMAGE ?? "gpt-image-1"),
            prompt: "A cup of coffee, flat vector",
            size: "1024x1024",
          }),
      ],
    ];
  }
  let failed = 0;
  for (const [name, fn] of checks) {
    try {
      await fn();
      console.log(`PASS ${name}`);
    } catch (e) {
      failed++;
      console.error(`FAIL ${name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} provider check(s) failed. Fix keys/models in .env.local before live mode.`);
    console.error(
      "Fallback: set both MODEL_ACTOR family checks to the working provider and document the caveat in README.",
    );
    process.exit(1);
  }
  console.log("\nAll providers OK. Live mode is safe.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
