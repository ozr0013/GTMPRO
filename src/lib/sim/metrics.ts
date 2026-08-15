import { db } from "@/lib/db/client";
import { engagements, funnelEvents } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export interface PostMetrics {
  impressions: number;
  likes: number;
  comments: number;
  saves: number;
  profileVisits: number;
  follows: number;
  linkClicks: number;
  signups: number;
  dmsStarted: number;
  meetings: number;
}

const EMPTY: PostMetrics = {
  impressions: 0,
  likes: 0,
  comments: 0,
  saves: 0,
  profileVisits: 0,
  follows: 0,
  linkClicks: 0,
  signups: 0,
  dmsStarted: 0,
  meetings: 0,
};

const ENGAGEMENT_FIELD: Record<string, keyof PostMetrics> = {
  impression: "impressions",
  like: "likes",
  comment: "comments",
  save: "saves",
  profile_visit: "profileVisits",
  follow: "follows",
};

const FUNNEL_FIELD: Record<string, keyof PostMetrics> = {
  link_click: "linkClicks",
  signup: "signups",
  dm_started: "dmsStarted",
  meeting_booked: "meetings",
};

/** Rolled-up counts for one post. Used by the analyst, the bandit reward, and the UI. */
export function postMetrics(worldId: string, postId: string): PostMetrics {
  const out = { ...EMPTY };
  for (const e of db
    .select()
    .from(engagements)
    .where(and(eq(engagements.worldId, worldId), eq(engagements.postId, postId)))
    .all()) {
    const field = ENGAGEMENT_FIELD[e.kind];
    if (field) out[field] += 1;
  }
  for (const f of db
    .select()
    .from(funnelEvents)
    .where(and(eq(funnelEvents.worldId, worldId), eq(funnelEvents.sourcePostId, postId)))
    .all()) {
    const field = FUNNEL_FIELD[f.kind];
    if (field) out[field] += 1;
  }
  return out;
}
