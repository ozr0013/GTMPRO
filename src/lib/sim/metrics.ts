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

  const worldFunnel = db
    .select()
    .from(funnelEvents)
    .where(eq(funnelEvents.worldId, worldId))
    .all();

  for (const f of worldFunnel) {
    if (f.sourcePostId !== postId) continue;
    const field = FUNNEL_FIELD[f.kind];
    if (field) out[field] += 1;
  }

  /*
   * meeting_booked and disqualified are written by the publisher when a DM thread
   * qualifies, and it has no post in hand — so those rows carry no sourcePostId.
   * Counting only post-attributed rows made "meetings booked", the headline metric,
   * permanently zero even when threads were qualifying.
   *
   * Attribute them through the conversation: the persona's dm_started row records
   * the post that opened the thread, so the meeting belongs to that post.
   */
  const openedByThisPost = new Set(
    worldFunnel
      .filter((f) => f.kind === "dm_started" && f.sourcePostId === postId)
      .map((f) => f.personaId),
  );
  if (openedByThisPost.size > 0) {
    for (const f of worldFunnel) {
      if (f.kind !== "meeting_booked" || f.sourcePostId) continue;
      if (openedByThisPost.has(f.personaId)) out.meetings += 1;
    }
  }
  return out;
}
