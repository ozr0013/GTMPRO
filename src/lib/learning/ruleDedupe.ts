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
 * Collapse rules that have converged on the same text.
 *
 * Guarding additions is not enough: the coach also *amends* several existing
 * rules toward one idea, and three separately-keyed rules can end up byte
 * identical. Observed live in v4 — rule-5c9d740d, rule-296ee866 and rule-811bde19
 * all reading "Educational posts must include a clear call-to-action that
 * explicitly directs users to a link ... 35%".
 *
 * Keeps the survivor with the most measured evidence (ties break toward the
 * rule that has been around longest) and returns the ruleKeys to retire.
 */
export function collapseConvergedRules(
  rules: { ruleKey: string; text: string }[],
  citations: (ruleKey: string) => number = () => 0,
): { retire: string[]; groups: { kept: string; retired: string[] }[] } {
  const retire: string[] = [];
  const groups: { kept: string; retired: string[] }[] = [];
  const consumed = new Set<string>();

  for (let i = 0; i < rules.length; i++) {
    if (consumed.has(rules[i].ruleKey)) continue;
    const cluster = [rules[i]];
    for (let j = i + 1; j < rules.length; j++) {
      if (consumed.has(rules[j].ruleKey)) continue;
      if (textSimilarity(rules[i].text, rules[j].text) >= DUPLICATE_THRESHOLD) {
        cluster.push(rules[j]);
        consumed.add(rules[j].ruleKey);
      }
    }
    if (cluster.length === 1) continue;

    // survivor = most evidence; index order breaks ties, so older rules win
    const kept = cluster.reduce((best, r) =>
      citations(r.ruleKey) > citations(best.ruleKey) ? r : best,
    );
    const losers = cluster.filter((r) => r.ruleKey !== kept.ruleKey).map((r) => r.ruleKey);
    retire.push(...losers);
    groups.push({ kept: kept.ruleKey, retired: losers });
  }
  return { retire, groups };
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
