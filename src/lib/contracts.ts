// SHARED FILE — additive-only after Phase 0. Announce changes in docs/PROGRESS.md.
// Zod contracts for every agent's structured output (Track B owns).

import { z } from "zod";

const range = z.tuple([z.number(), z.number()]);

export const PredictedEffectSchema = z.object({
  impressions: range,
  likes: range,
  linkClicks: range,
  signups: range,
});
export type PredictedEffectT = z.infer<typeof PredictedEffectSchema>;

export const StrategistOutput = z.object({
  actions: z
    .array(
      z.object({
        kind: z.enum(["post", "reply", "dm_reply"]),
        archetype: z.enum(["education", "story", "meme", "product"]).optional(),
        timeSlot: z.enum(["morning", "midday", "evening"]).optional(),
        topic: z.string(),
        angle: z.string(),
        threadId: z.string().optional(),
        replyToEngagementId: z.string().optional(),
        reasoning: z.string(),
        evidenceRuleIds: z.array(z.string()),
        banditArmId: z.string().optional(),
        predictedEffect: PredictedEffectSchema,
        riskClass: z.enum(["normal", "sensitive"]),
      }),
    )
    .min(1)
    .max(3),
  strategyNote: z.string(),
});
export type StrategistOutputT = z.infer<typeof StrategistOutput>;

export const CopywriterOutput = z.object({
  caption: z.string().min(10),
  hashtags: z.array(z.string()).max(8),
  creativeBrief: z.string(),
  altText: z.string(),
});
export type CopywriterOutputT = z.infer<typeof CopywriterOutput>;

export const CriticOutput = z.object({
  verdict: z.enum(["pass", "revise", "block"]),
  issues: z.array(
    z.object({
      severity: z.enum(["low", "medium", "high"]),
      kind: z.enum(["brand_safety", "spam_risk", "guardrail", "platform_norm", "quality"]),
      note: z.string(),
    }),
  ),
  revisedCaption: z.string().optional(),
});
export type CriticOutputT = z.infer<typeof CriticOutput>;

export const AnalystOutput = z.object({
  verdict: z.enum(["exceeded", "met", "missed"]),
  attribution: z.array(
    z.object({
      factor: z.string(), // e.g. "timing", "archetype", "topic", "caption style"
      direction: z.enum(["helped", "hurt"]),
      confidence: z.number().min(0).max(1),
    }),
  ),
  summary: z.string(),
  suggestedLessons: z.array(
    z.object({
      category: z.enum(["voice", "content", "timing", "audience", "guardrail"]),
      text: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});
export type AnalystOutputT = z.infer<typeof AnalystOutput>;

export const CoachOutput = z.object({
  playbookChanges: z.object({
    add: z.array(
      z.object({
        category: z.enum(["voice", "content", "timing", "audience", "guardrail"]),
        text: z.string(),
        evidenceRefs: z.array(z.string()),
        sourceType: z.enum(["outcome", "rejection", "edit"]),
      }),
    ),
    amend: z.array(z.object({ ruleKey: z.string(), text: z.string() })),
    retire: z.array(z.string()),
  }),
  changeSummary: z.string(),
});
export type CoachOutputT = z.infer<typeof CoachOutput>;

export const CommunityOutput = z.object({
  replyText: z.string(),
  qualification: z.enum(["continue", "meeting_booked", "disqualified"]),
  rationale: z.string(),
});
export type CommunityOutputT = z.infer<typeof CommunityOutput>;

export const PersonaVoiceOutput = z.object({
  commentText: z.string().max(220),
});
export type PersonaVoiceOutputT = z.infer<typeof PersonaVoiceOutput>;
