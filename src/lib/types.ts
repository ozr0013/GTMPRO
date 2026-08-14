// SHARED FILE — additive-only after Phase 0. Announce changes in docs/PROGRESS.md.

export type Archetype = "education" | "story" | "meme" | "product";
export type TimeSlot = "morning" | "midday" | "evening";

export const ARCHETYPES: Archetype[] = ["education", "story", "meme", "product"];
export const TIME_SLOTS: Record<TimeSlot, number[]> = {
  morning: [7, 8, 9],
  midday: [11, 12, 13],
  evening: [18, 19, 20],
};

export interface PersonaHidden {
  interests: string[];
  skepticism: number; // 0..1
  engagementPropensity: number; // 0..1
  purchaseIntent: number; // 0..1
  dmOpenness: number; // 0..1
  activeHours: number[]; // hours 0..23
}

export interface WorldConfig {
  /** hidden ground truth: segment -> archetype -> affinity 0..1 */
  affinity: Record<string, Record<Archetype, number>>;
  algo: {
    earlyVelocityBoost: number; // e.g. 1.3
    overPostPenalty: number; // e.g. 0.6 applied beyond maxOrganicReachPostsPerDay
    maxOrganicReachPostsPerDay: number; // e.g. 2
    discoveryFloor: number; // min non-follower sample per post, e.g. 10
    discoveryRate: number; // fraction of non-followers sampled, e.g. 0.15
  };
  topics: string[];
}

export interface PredictedEffect {
  impressions: [number, number];
  likes: [number, number];
  linkClicks: [number, number];
  signups: [number, number];
}

export interface PostPayload {
  archetype: Archetype;
  timeSlot: TimeSlot;
  topic: string;
  caption: string;
  hashtags: string[];
  creativeBrief: string;
  scheduledTick: number;
}

export interface DmReplyPayload {
  threadId: string;
  text: string;
}

export interface ReplyPayload {
  postId: string;
  commentEngagementId: string;
  text: string;
}

export type ProposalPayload = PostPayload | DmReplyPayload | ReplyPayload;
