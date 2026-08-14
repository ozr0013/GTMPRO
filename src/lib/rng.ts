import seedrandom from "seedrandom";

export type Rng = () => number;

export function makeRng(seed: string): Rng {
  return seedrandom(seed);
}

/** Stable per-entity rng so outcomes don't depend on iteration order. */
export function subRng(worldSeed: string, ...parts: (string | number)[]): Rng {
  return seedrandom(`${worldSeed}:${parts.join(":")}`);
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}
