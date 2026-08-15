// Renders one hero image per archetype so you can judge quality and tune settings
// without rebuilding the demo snapshot.
//
//   npm run images:test
//
// Writes to public/generated/_test-<archetype>.<ext> and prints which provider
// actually served each one — if it says "svg" while you expected a GPU, the
// server was unreachable and the fallback ran.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

function loadEnvLocal(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      let value = m[2].trim();
      const quote = value[0];
      if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
        value = value.slice(1, -1);
      } else {
        const hash = value.indexOf("#");
        if (hash !== -1) value = value.slice(0, hash).trim();
      }
      if (!(m[1] in process.env)) process.env[m[1]] = value;
    }
  } catch {
    /* no .env.local */
  }
}
loadEnvLocal();

const BRIEFS: { archetype: string; topic: string; creativeBrief: string }[] = [
  {
    archetype: "education",
    topic: "brewing-science",
    creativeBrief: "Split-frame comparison of cold brew and hot brew in glass carafes",
  },
  {
    archetype: "story",
    topic: "morning-routine",
    creativeBrief: "Hands pouring cold brew concentrate over ice at a kitchen counter",
  },
  {
    archetype: "meme",
    topic: "coffee-hacks",
    creativeBrief: "A wildly overfilled coffee cup on a plain backdrop",
  },
  {
    archetype: "product",
    topic: "cold-brew-ratios",
    creativeBrief: "A matte black bottle of cold brew concentrate beside a measuring jug",
  },
];

async function main() {
  const { buildImagePrompt } = await import("@/lib/agents/artdirector");
  const { generateImageBytes, imageProviderName, imageBaseUrl, probeImageServer } = await import(
    "@/lib/agents/imageProvider"
  );

  const provider = imageProviderName();
  console.log(`IMAGE_PROVIDER=${provider}${provider === "svg" ? "" : ` · ${imageBaseUrl()}`}`);

  if (provider !== "svg" && provider !== "openai") {
    const up = await probeImageServer(2500);
    if (!up) {
      console.error(
        `\n${imageBaseUrl()} is not responding. Start the server (A1111 needs --api) or leave IMAGE_PROVIDER unset to use the offline renderer.\n`,
      );
      process.exit(1);
    }
    console.log("server reachable\n");
  }

  const outDir = resolve(process.cwd(), "public", "generated");
  mkdirSync(outDir, { recursive: true });

  for (const brief of BRIEFS) {
    const prompt = buildImagePrompt(brief);
    const started = Date.now();
    const { image, error } = await generateImageBytes(prompt);
    const secs = ((Date.now() - started) / 1000).toFixed(1);

    if (!image) {
      console.log(`${brief.archetype.padEnd(10)} FELL BACK to svg after ${secs}s — ${error ?? "provider is svg"}`);
      continue;
    }
    const file = join(outDir, `_test-${brief.archetype}.${image.ext}`);
    writeFileSync(file, image.bytes);
    console.log(
      `${brief.archetype.padEnd(10)} ${image.provider.padEnd(6)} ${secs}s  ${(image.bytes.length / 1024).toFixed(0)}kb  -> public/generated/_test-${brief.archetype}.${image.ext}`,
    );
  }

  console.log("\nOpen public/generated/ to compare. Tune with IMAGE_STEPS / IMAGE_CFG / IMAGE_MODEL.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
