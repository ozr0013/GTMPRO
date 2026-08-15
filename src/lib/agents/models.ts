// Model registry: cross-family assignment, mock mode, retry-once-never-throw (Track B owns).

import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
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
} from "@/lib/contracts";

export type AgentRole =
  | "strategist"
  | "copywriter"
  | "critic"
  | "analyst"
  | "coach"
  | "community"
  | "persona";

// Cross-family assignment is intentional: evaluators (critic/analyst) are a different
// model family than the actors they judge (self-preference bias mitigation — see README).
export function modelFor(role: AgentRole) {
  const actor = process.env.MODEL_ACTOR ?? "claude-sonnet-4-5";
  const judge = process.env.MODEL_JUDGE ?? "gpt-5";
  const cheap = process.env.MODEL_CHEAP ?? "gpt-5-mini";
  switch (role) {
    case "strategist":
    case "copywriter":
    case "coach":
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
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { object } = await generateObject<z.ZodType<T>, "object", T>({
        model: modelFor(role),
        schema,
        system,
        prompt: user,
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
  }
}
