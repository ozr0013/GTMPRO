// World genesis pipeline: product description -> simulated audience (Track A owns).

import { callAgent } from "@/lib/agents/models";
import { SYSTEM } from "@/lib/agents/prompts";
import { GenesisOutput } from "@/lib/contracts";
import { buildWorldFromGenesis } from "./build";

function genesisPrompt(productDescription: string): string {
  return [
    "Design the simulated Pictogram audience for this product.",
    "",
    `Product description: ${productDescription}`,
  ].join("\n");
}

/**
 * Generate a full world from a product description.
 * Mock mode returns a deterministic coffee-brand topology (~100 personas);
 * live mode derives segments, interests, topics and seed rules from the description.
 * Throws on genesis-model failure — callers (onboarding UI) surface the error.
 */
export async function generateWorld(
  productDescription: string,
  seed: string,
): Promise<{ worldId: string }> {
  const res = await callAgent(
    "genesis",
    GenesisOutput,
    SYSTEM.genesis,
    genesisPrompt(productDescription),
    { worldSeed: seed, refId: "genesis" },
  );
  if (!res.ok) {
    throw new Error(`World genesis failed: ${res.error}`);
  }
  return buildWorldFromGenesis(res.data, { productDescription, seed });
}
