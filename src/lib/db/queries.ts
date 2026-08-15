// Read-side contract for the UI (Track C builds on this).
// Every function returns plain serializable objects — no Drizzle rows leak out.

import { db } from "@/lib/db/client";
import { worlds, settings, posts, engagements, personas, proposals, activityLog } from "@/lib/db/schema";
import type { PostPayload, PredictedEffect } from "@/lib/types";
import { and, desc, eq, sql } from "drizzle-orm";

export interface WorldSummary {
  id: string;
  name: string;
  productDescription: string;
  simTick: number;
  mode: string;
  paused: boolean;
}

export interface FeedComment {
  handle: string;
  text: string;
  tick: number;
}

export interface FeedPost {
  id: string;
  authorType: string;
  archetype: string;
  topic: string;
  caption: string;
  hashtags: string[];
  creativeBrief: string;
  publishedTick: number;
  likeCount: number;
  commentCount: number;
  comments: FeedComment[];
}

/** Union of the payload shapes a pending proposal can carry (post or dm_reply). */
export type ProposalPayloadView = Partial<PostPayload> & {
  threadId?: string;
  text?: string;
  qualification?: string;
};

export interface PendingProposalRow {
  id: string;
  kind: string;
  payload: ProposalPayloadView;
  reasoning: string;
  ruleIds: string[];
  banditArmId: string | null;
  predictedEffect: PredictedEffect;
  riskClass: string;
  createdTick: number;
}

export interface ActivityRow {
  id: string;
  tick: number;
  actor: string;
  action: string;
  status: string;
  summary: string;
}

export function getWorld(): WorldSummary | null {
  const world = db.select().from(worlds).get();
  if (!world) return null;
  const worldSettings = db.select().from(settings).where(eq(settings.worldId, world.id)).get();
  return {
    id: world.id,
    name: world.name,
    productDescription: world.productDescription,
    simTick: world.simTick,
    mode: worldSettings?.mode ?? "propose",
    paused: worldSettings?.paused ?? false,
  };
}

export function getFeed(worldId: string): FeedPost[] {
  const published = db
    .select()
    .from(posts)
    .where(and(eq(posts.worldId, worldId), eq(posts.status, "published")))
    .orderBy(desc(posts.publishedTick))
    .all();
  const handleById = new Map(
    db.select().from(personas).where(eq(personas.worldId, worldId)).all().map((p) => [p.id, p.handle]),
  );
  return published.map((post) => {
    const rows = db.select().from(engagements).where(eq(engagements.postId, post.id)).all();
    const comments = rows
      .filter((e) => e.kind === "comment")
      .map((e) => ({
        handle: handleById.get(e.personaId) ?? "unknown",
        text: e.commentText ?? "",
        tick: e.tick,
      }));
    return {
      id: post.id,
      authorType: post.authorType,
      archetype: post.archetype,
      topic: post.topic,
      caption: post.caption,
      hashtags: post.hashtags as string[],
      creativeBrief: post.creativeBrief,
      publishedTick: post.publishedTick ?? post.scheduledTick,
      likeCount: rows.filter((e) => e.kind === "like").length,
      commentCount: comments.length,
      comments,
    };
  });
}

export function getPendingProposals(worldId: string): PendingProposalRow[] {
  return db
    .select()
    .from(proposals)
    .where(and(eq(proposals.worldId, worldId), eq(proposals.status, "pending")))
    .orderBy(desc(proposals.createdTick))
    .all()
    .map((p) => {
      const evidence = p.evidence as { ruleIds?: string[]; banditArmId?: string };
      return {
        id: p.id,
        kind: p.kind,
        payload: p.payload as ProposalPayloadView,
        reasoning: p.reasoning,
        ruleIds: evidence.ruleIds ?? [],
        banditArmId: evidence.banditArmId ?? null,
        predictedEffect: p.predictedEffect as PredictedEffect,
        riskClass: p.riskClass,
        createdTick: p.createdTick,
      };
    });
}

export function getActivity(worldId: string, limit = 100): ActivityRow[] {
  return db
    .select()
    .from(activityLog)
    .where(eq(activityLog.worldId, worldId))
    .orderBy(desc(sql`rowid`))
    .limit(limit)
    .all()
    .map((r) => ({
      id: r.id,
      tick: r.tick,
      actor: r.actor,
      action: r.action,
      status: r.status,
      summary: r.summary,
    }));
}
