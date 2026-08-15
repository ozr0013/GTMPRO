// Model registry: cross-family assignment, mock mode, retry-once-never-throw (Track B owns).

import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { z } from "zod";
import { subRng, pick } from "@/lib/rng";
import {
  StrategistOutput,
  CopywriterOutput,
  CriticOutput,
  AnalystOutput,
  CoachOutput,
  CommunityOutput,
  PersonaVoiceOutput,
  GenesisOutput,
} from "@/lib/contracts";

export type AgentRole =
  | "strategist"
  | "copywriter"
  | "critic"
  | "analyst"
  | "coach"
  | "community"
  | "persona"
  | "genesis";

/** true when running against a local OpenAI-compatible server (Ollama) instead of cloud APIs.
 * Local is the default and the only validated live path — this project runs on
 * zero API keys (docs/LOCAL_MODELS.md). Set MODEL_PROVIDER=cloud to opt into
 * the untested cloud fallback. */
export function isLocalProvider(): boolean {
  return (process.env.MODEL_PROVIDER ?? "local") === "local";
}

/** Local model names per role group. Cheap roles default to the judge model so
 * low-RAM machines keep only two models resident (see docs/LOCAL_MODELS.md). */
export function localModelNames() {
  const actor = process.env.MODEL_ACTOR_LOCAL ?? "qwen3:8b";
  const judge = process.env.MODEL_JUDGE_LOCAL ?? "gemma3:4b";
  const cheap = process.env.MODEL_CHEAP_LOCAL ?? judge;
  return { actor, judge, cheap };
}

function localModelNameFor(role: AgentRole): string {
  const { actor, judge, cheap } = localModelNames();
  switch (role) {
    case "strategist":
    case "copywriter":
    case "coach":
    case "genesis":
      return actor;
    case "critic":
    case "analyst":
      return judge;
    case "community":
    case "persona":
      return cheap;
  }
}

// Cross-family assignment is intentional: evaluators (critic/analyst) are a different
// model family than the actors they judge (self-preference bias mitigation — see README).
// Local (the default, and the only validated path): Qwen3 acts, Gemma 3 judges —
// zero API keys (docs/LOCAL_MODELS.md). Cloud (opt-in via MODEL_PROVIDER=cloud,
// untested): Claude acts, GPT judges — same cross-family principle.
export function modelFor(role: AgentRole) {
  if (isLocalProvider()) {
    const local = createOpenAICompatible({
      name: "ollama",
      baseURL: process.env.LOCAL_BASE_URL ?? "http://localhost:11434/v1",
      // Ollama supports schema-constrained decoding via response_format. Without
      // this flag the provider silently drops the JSON schema ("responseFormat is
      // not supported") and generateObject falls back to prompt-based JSON, which
      // small local models fail — every structured call dies, genesis first.
      // Note: `npm run smoke` cannot catch this, since generateText carries no
      // schema. Validate local mode with scripts/e2e-drive.ts.
      supportsStructuredOutputs: true,
    });
    return local(localModelNameFor(role));
  }
  const actor = process.env.MODEL_ACTOR ?? "claude-sonnet-4-5";
  const judge = process.env.MODEL_JUDGE ?? "gpt-5";
  const cheap = process.env.MODEL_CHEAP ?? "gpt-5-mini";
  switch (role) {
    case "strategist":
    case "copywriter":
    case "coach":
    case "genesis":
      return anthropic(actor);
    case "critic":
    case "analyst":
      return openai(judge);
    case "community":
    case "persona":
      return openai(cheap);
  }
}

type CallResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function callAgent<T>(
  role: AgentRole,
  schema: z.ZodType<T>,
  system: string,
  user: string,
  opts: { worldSeed: string; refId: string },
): Promise<CallResult<T>> {
  if ((process.env.MODEL_MODE ?? "mock") === "mock") {
    return { ok: true, data: mockFor(role, opts, user) as T };
  }
  const isJudge = role === "critic" || role === "analyst";
  let effectiveSystem = system;
  let temperature: number | undefined;
  if (isLocalProvider()) {
    // Qwen3 emits <think> blocks by default; suppress for clean structured output.
    if (localModelNameFor(role).startsWith("qwen3")) {
      effectiveSystem = `${system}\n/no_think`;
    }
    temperature = isJudge ? 0.2 : 0.7; // steadier judgments on small local models
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { object } = await generateObject<z.ZodType<T>, "object", T>({
        model: modelFor(role),
        schema,
        system: effectiveSystem,
        prompt: user,
        temperature,
      });
      return { ok: true, data: object };
    } catch (err) {
      if (attempt === 1) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  }
  return { ok: false, error: "unreachable" };
}

/** Rule keys from the "Playbook rules:" section of a rendered strategist context.
 * Order matches the playbook: seed rules first, coach additions appended — so the
 * last keys are the newest learning. Delimiters match renderContext's exact
 * header lines so rule text mentioning "Bandit arms" cannot truncate the scan. */
function contextRuleKeys(user: string): string[] {
  const section = user.split("Playbook rules:\n")[1]?.split("\nBandit arms (cite banditArmId")[0] ?? "";
  return [...section.matchAll(/^\[([\w-]+)\]/gm)].map((m) => m[1]);
}

/** Seeded, schema-valid canned outputs so the full loop runs offline. The mocks
 * read their inputs the way the live models would (rules from the rendered
 * context, digests as JSON) so learning visibly changes behavior even offline. */
function mockFor(role: AgentRole, opts: { worldSeed: string; refId: string }, user = ""): unknown {
  const rng = subRng(opts.worldSeed, "mock", role, opts.refId);
  const archetype = pick(rng, ["education", "story", "meme", "product"] as const);
  const timeSlot = pick(rng, ["morning", "midday", "evening"] as const);
  switch (role) {
    case "strategist": {
      // Two citation needs, both real (merged from parallel fixes):
      //  - the NEWEST rule (last in the context list) must be cited so a rule the
      //    coach just learned shows up in the very next proposal's evidence — the
      //    demo's closure beat, regression-tested in tests/loop.test.ts;
      //  - citations must land on rules that exist in THIS world and spread across
      //    the playbook, or rule→outcome attribution reads "never cited" forever.
      const known = contextRuleKeys(user);
      const newest = known[known.length - 1];
      const spread = known.length > 1 ? pick(rng, known.slice(0, -1)) : undefined;
      const cited = newest ? (spread ? [newest, spread] : [newest]) : ["timing-1"];
      return StrategistOutput.parse({
        actions: [
          {
            kind: "post",
            archetype,
            timeSlot,
            topic: "brewing-science",
            angle: `A ${archetype} angle on brewing science`,
            reasoning: `Bandit favors ${archetype}/${timeSlot}; applying playbook ${cited.join(" and ")}.`,
            evidenceRuleIds: cited,
            predictedEffect: { impressions: [15, 30], likes: [3, 8], linkClicks: [1, 3], signups: [0, 1] },
            riskClass: "normal",
          },
        ],
        strategyNote: `Explore ${archetype} content in the ${timeSlot} slot.`,
      });
    }
    case "copywriter":
      return CopywriterOutput.parse({
        caption: `Mock caption ${opts.refId.slice(0, 6)}: water temperature changes everything about extraction.`,
        hashtags: ["#coldbrew", "#coffeescience"],
        creativeBrief: "Split-frame brew diagram",
        altText: "Brew diagram",
      });
    case "critic":
      if (/\bFORCE_CRITIC_BLOCK\b/.test(user)) {
        return CriticOutput.parse({
          verdict: "block",
          issues: [{ severity: "high", kind: "quality", note: "forced block for tests" }],
        });
      }
      return CriticOutput.parse({ verdict: "pass", issues: [] });
    case "analyst":
      return AnalystOutput.parse({
        verdict: pick(rng, ["exceeded", "met", "missed"] as const),
        attribution: [{ factor: "timing", direction: "helped", confidence: 0.7 }],
        summary: "Mock analysis: morning slot outperformed prediction.",
        suggestedLessons: [{ category: "timing", text: "Morning education posts outperform.", confidence: 0.7 }],
      });
    case "coach": {
      // The coach digest arrives as JSON (see coachRunner). Read it the way the
      // live coach would — merged behavior from two parallel fixes:
      //  - outstanding rejections MUST become rules, echoing the human's own words
      //    (with the proposalId in evidenceRefs so addressed-ness tracking sees it);
      //  - outcome cycles draw DISTINCT rotating lessons, because the dedupe guard
      //    now drops restated rules and a single canned lesson would freeze the
      //    playbook after v2.
      type Digest = {
        outcomeReports?: { verdict?: string }[];
        humanRejections_MUST_ADDRESS?: { proposalId: string; humanSaid: string }[];
        humanEdits?: { proposalId: string }[];
        librarian_consolidation?: boolean;
        cap?: number;
        activeRules?: { ruleKey: string; category: string; text: string; sourceType: string }[];
      };
      let digest: Digest | null = null;
      try {
        digest = JSON.parse(user) as Digest;
      } catch {
        digest = null; // non-digest input (direct-call unit tests)
      }
      if (digest?.librarian_consolidation && digest.activeRules) {
        // Deterministic consolidation: keep the 2 newest rules per category plus
        // every human-rejection rule; retire the rest. Mirrors the live
        // librarian's brief without an LLM.
        const keepPerCategory = new Map<string, number>();
        const retire: string[] = [];
        for (const rule of [...digest.activeRules].reverse()) {
          if (rule.sourceType === "rejection") continue; // human constraints survive
          const kept = keepPerCategory.get(rule.category) ?? 0;
          if (kept < 2) keepPerCategory.set(rule.category, kept + 1);
          else retire.push(rule.ruleKey);
        }
        return CoachOutput.parse({
          playbookChanges: { add: [], amend: [], retire },
          changeSummary: `retired ${retire.length} overlapping rule${retire.length === 1 ? "" : "s"} (2 newest per category kept, human constraints untouched)`,
        });
      }
      type Add = {
        category: "voice" | "content" | "timing" | "audience" | "guardrail";
        text: string;
        evidenceRefs: string[];
        sourceType: "outcome" | "rejection" | "edit";
      };
      const add: Add[] = [];
      if (digest?.humanEdits?.length) {
        add.push({
          category: "voice",
          text: "Keep hashtag count low; do not lead with hashtag dumps.",
          evidenceRefs: digest.humanEdits.map((e) => e.proposalId),
          sourceType: "edit",
        });
      }
      if (digest?.humanRejections_MUST_ADDRESS?.length) {
        // Echo each distinct typed reason (capped) — every rejection is human
        // training signal, and citing its proposalId marks it addressed.
        const seen = new Set<string>();
        for (const rejection of digest.humanRejections_MUST_ADDRESS) {
          const reason = rejection.humanSaid?.trim() || "rejected without a stated reason";
          if (seen.has(reason)) continue;
          seen.add(reason);
          if (seen.size > 3) break;
          add.push({
            category: "content",
            text: `Human rejection: "${reason.slice(0, 90)}" — do not propose this pattern again.`,
            evidenceRefs: digest.humanRejections_MUST_ADDRESS
              .filter((r) => (r.humanSaid?.trim() || "rejected without a stated reason") === reason)
              .map((r) => r.proposalId),
            sourceType: "rejection",
          });
        }
      }
      if (digest?.outcomeReports?.length) {
        // Distinct lessons per cycle so consecutive digests never restate a rule.
        const lessons = [
          { category: "timing", text: "Prefer morning slots for education posts; engagement peaks 7-9am." },
          { category: "content", text: "Open with a concrete number; vague claims underperform." },
          { category: "audience", text: "Cafe owners respond to product posts, not memes." },
          { category: "voice", text: "One question per caption; stacked questions reduce replies." },
        ] as const;
        const lesson = pick(rng, lessons);
        add.push({
          category: lesson.category,
          text: lesson.text,
          evidenceRefs: [opts.refId],
          sourceType: "outcome",
        });
      }
      if (add.length === 0) {
        // Legacy path for non-JSON digests: preserve the old regex heuristics.
        const editLike =
          /hashtag|word-diff|humanEditDiff|sourceType["']?\s*:\s*["']?edit/i.test(user) ||
          /-\s*#\w+/.test(user);
        add.push(
          editLike
            ? {
                category: "voice",
                text: "Keep hashtag count low; do not lead with hashtag dumps.",
                evidenceRefs: [opts.refId],
                sourceType: "edit",
              }
            : {
                category: "timing",
                text: `Learned rule ${opts.refId.slice(0, 6)}: prefer morning education posts.`,
                evidenceRefs: [opts.refId],
                sourceType: "outcome",
              },
        );
      }
      const sources = [...new Set(add.map((a) => a.sourceType))].join(" + ");
      return CoachOutput.parse({
        playbookChanges: { add, amend: [], retire: [] },
        changeSummary: `+${add.length} rule${add.length === 1 ? "" : "s"} from ${sources}`,
      });
    }
    case "community":
      return CommunityOutput.parse({
        replyText: "Happy to walk you through it — want a quick 15-min call?",
        qualification: rng() < 0.4 ? "meeting_booked" : "continue",
        rationale: "Mock qualification.",
      });
    case "persona":
      return PersonaVoiceOutput.parse({
        commentText: pick(rng, [
          "This is the content I follow for.",
          "Okay this is actually useful.",
          "Trying this tomorrow morning.",
        ]),
      });
    case "genesis":
      // Fully deterministic (ignores the product description in mock mode; live mode
      // derives everything from it). Sizes sum to 100 personas.
      return GenesisOutput.parse({
        brandName: "TestBrew",
        segments: [
          {
            name: "coffee-nerds",
            size: 34,
            affinity: { education: 0.9, story: 0.5, meme: 0.6, product: 0.4 },
            interests: ["brewing-science", "bean-sourcing"],
          },
          {
            name: "busy-pros",
            size: 33,
            affinity: { education: 0.4, story: 0.6, meme: 0.3, product: 0.7 },
            interests: ["morning-routine", "brewing-science"],
          },
          {
            name: "cafe-owners",
            size: 33,
            affinity: { education: 0.7, story: 0.4, meme: 0.2, product: 0.9 },
            interests: ["cafe-economics", "bean-sourcing"],
          },
        ],
        topics: ["brewing-science", "morning-routine", "cafe-economics", "bean-sourcing"],
        ambientAccounts: [
          { handle: "daily-drip", bio: "Coffee memes and takes", postingStyle: "meme" },
          { handle: "roast-report", bio: "Industry news for cafe operators", postingStyle: "education" },
          { handle: "brewrival", bio: "A competing cold brew brand", postingStyle: "product" },
        ],
        seedRules: [
          { category: "voice", text: "Confident, warm, no hype words." },
          { category: "content", text: "Hypothesis: education content wins with enthusiasts." },
          { category: "timing", text: "Hypothesis: mornings perform best." },
        ],
      });
  }
}
