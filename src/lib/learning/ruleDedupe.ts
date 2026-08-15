// The coach re-derives lessons from the same outcome report on consecutive
// cycles, so it kept adding rules that restate an existing one almost verbatim.
// Observed live: two rules both reading "Educational posts must use the
// 'Did you know?' format and include a clear CTA ... boost engagement by 35%".
//
// A playbook of near-duplicates is worse than a short one: it dilutes the
// citations the strategist makes and makes the Brain view look padded.

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "to", "of", "for", "with", "in", "on", "at", "by",
  "is", "are", "be", "must", "should", "that", "this", "it", "as", "from", "e.g",
]);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/ref:\s*\S+/g, "") // evidence refs are not content
      .replace(/[^a-z0-9\s%]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/** Jaccard overlap of content words, 0..1. */
export function textSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / (ta.size + tb.size - shared);
}

/** Above this two rules are saying the same thing in different words. */
export const DUPLICATE_THRESHOLD = 0.6;

export function isNearDuplicate(candidate: string, existing: string[]): boolean {
  return existing.some((e) => textSimilarity(candidate, e) >= DUPLICATE_THRESHOLD);
}

/**
 * Drop additions that restate a rule already in the playbook (or an earlier
 * addition in the same batch). Returns the kept adds plus what was dropped, so
 * the caller can report it rather than silently discarding the coach's output.
 */
export function dropDuplicateAdds<T extends { text: string }>(
  adds: T[],
  existingTexts: string[],
): { kept: T[]; dropped: { text: string; duplicateOf: string }[] } {
  const kept: T[] = [];
  const dropped: { text: string; duplicateOf: string }[] = [];
  const seen = [...existingTexts];

  for (const add of adds) {
    const match = seen.find((e) => textSimilarity(add.text, e) >= DUPLICATE_THRESHOLD);
    if (match) dropped.push({ text: add.text, duplicateOf: match });
    else {
      kept.push(add);
      seen.push(add.text);
    }
  }
  return { kept, dropped };
}
