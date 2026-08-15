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

/** true when running against a local OpenAI-compatible server (Ollama) instead of cloud APIs */
export function isLocalProvider(): boolean {
  return (process.env.MODEL_PROVIDER ?? "cloud") === "local";
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
// Cloud: Claude acts, GPT judges. Local: Qwen acts, Gemma judges — same principle,
// zero API cost (see docs/LOCAL_MODELS.md).
export function modelFor(role: AgentRole) {
  if (isLocalProvider()) {
    const local = createOpenAICompatible({
      name: "ollama",
      baseURL: process.env.LOCAL_BASE_URL ?? "http://localhost:11434/v1",
      // Without this the provider silently drops the JSON schema ("responseFormat
      // is not supported"), so the model free-forms and every generateObject call
      // fails validation — genesis and the strategist die first. Ollama's
      // OpenAI-compatible endpoint does support json_schema response formats.
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

/** Seeded, schema-valid canned outputs so the full loop runs offline. */
function mockFor(role: AgentRole, opts: { worldSeed: string; refId: string }, user = ""): unknown {
  const rng = subRng(opts.worldSeed, "mock", role, opts.refId);
  const archetype = pick(rng, ["education", "story", "meme", "product"] as const);
  const timeSlot = pick(rng, ["morning", "midday", "evening"] as const);
  switch (role) {
    case "strategist":
      return StrategistOutput.parse({
        actions: [
          {
            kind: "post",
            archetype,
            timeSlot,
            topic: "brewing-science",
            angle: `A ${archetype} angle on brewing science`,
            reasoning: `Mock: bandit favors ${archetype}/${timeSlot}; playbook timing-1 suggests mornings.`,
            evidenceRuleIds: ["timing-1"],
            predictedEffect: { impressions: [15, 30], likes: [3, 8], linkClicks: [1, 3], signups: [0, 1] },
            riskClass: "normal",
          },
        ],
        strategyNote: "Mock strategy: explore education content.",
      });
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
      const editLike =
        /hashtag|word-diff|humanEditDiff|sourceType["']?\s*:\s*["']?edit/i.test(user) ||
        /-\s*#\w+/.test(user);
      if (editLike) {
        return CoachOutput.parse({
          playbookChanges: {
            add: [
              {
                category: "voice",
                text: "Keep hashtag count low; do not lead with hashtag dumps.",
                evidenceRefs: [opts.refId],
                sourceType: "edit",
              },
            ],
            amend: [],
            retire: [],
          },
          changeSummary: "Mock: +1 voice rule from human edit (hashtags)",
        });
      }
      return CoachOutput.parse({
        playbookChanges: {
          add: [
            {
              category: "timing",
              text: `Mock learned rule ${opts.refId.slice(0, 6)}: prefer morning education posts.`,
              evidenceRefs: [opts.refId],
              sourceType: "outcome",
            },
          ],
          amend: [],
          retire: [],
        },
        changeSummary: "Mock: +1 timing rule from outcomes",
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
