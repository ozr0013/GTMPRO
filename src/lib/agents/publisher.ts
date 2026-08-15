import { db } from "@/lib/db/client";
import {
  dmMessages,
  dmThreads,
  funnelEvents,
  posts,
  proposals,
  settings,
  worlds,
} from "@/lib/db/schema";
import type { DmReplyPayload, PostPayload, ReplyPayload, TimeSlot } from "@/lib/types";
import { TIME_SLOTS } from "@/lib/types";
import { logActivity } from "@/lib/agents/log";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";

export function nextTickForSlot(currentTick: number, slot: TimeSlot): number {
  const hours = TIME_SLOTS[slot];
  for (let offset = 0; offset < 24; offset++) {
    const t = currentTick + offset;
    if (hours.includes(t % 24)) return t;
  }
  return currentTick + 24;
}

function evidenceOf(proposal: { evidence: unknown }): { ruleIds?: string[]; banditArmId?: string } {
  return (proposal.evidence ?? {}) as { ruleIds?: string[]; banditArmId?: string };
}

function sendDmReply(worldId: string, tick: number, payload: DmReplyPayload): void {
  const thread = db.select().from(dmThreads).where(eq(dmThreads.id, payload.threadId)).get();
  if (!thread) return;
  db.insert(dmMessages)
    .values({
      id: randomUUID(),
      threadId: thread.id,
      sender: "agent",
      text: payload.text,
      tick,
    })
    .run();
  let status = thread.status;
  if (payload.qualification === "meeting_booked") {
    status = "qualified";
    db.insert(funnelEvents)
      .values({
        id: randomUUID(),
        worldId,
        personaId: thread.personaId,
        kind: "meeting_booked",
        tick,
      })
      .run();
  } else if (payload.qualification === "disqualified") {
    status = "disqualified";
    db.insert(funnelEvents)
      .values({
        id: randomUUID(),
        worldId,
        personaId: thread.personaId,
        kind: "disqualified",
        tick,
      })
      .run();
  }
  db.update(dmThreads)
    .set({ turnCount: thread.turnCount + 1, status })
    .where(eq(dmThreads.id, thread.id))
    .run();
}

/** Insert the scheduled post / DM / reply. No-op when the world is paused (B4 kill switch). */
export function publishProposal(proposalId: string): void {
  const proposal = db.select().from(proposals).where(eq(proposals.id, proposalId)).get();
  if (!proposal) return;
  const world = db.select().from(worlds).where(eq(worlds.id, proposal.worldId)).get()!;
  const s = db.select().from(settings).where(eq(settings.worldId, proposal.worldId)).get()!;
  if (s.paused) {
    logActivity({
      worldId: proposal.worldId,
      tick: world.simTick,
      actor: "publisher",
      action: "publish",
      status: "blocked",
      summary: "paused: publish skipped",
      refType: "proposal",
      refId: proposalId,
    });
    return;
  }

  if (proposal.kind === "post") {
    const payload = proposal.payload as PostPayload;
    const evidence = evidenceOf(proposal);
    db.insert(posts)
      .values({
        id: randomUUID(),
        worldId: proposal.worldId,
        authorType: "brand",
        proposalId: proposal.id,
        banditArmId: evidence.banditArmId ?? null,
        archetype: payload.archetype,
        topic: payload.topic,
        caption: payload.caption,
        hashtags: payload.hashtags,
        creativeBrief: payload.creativeBrief,
        scheduledTick: payload.scheduledTick,
        status: "scheduled",
      })
      .run();
  } else if (proposal.kind === "dm_reply") {
    sendDmReply(proposal.worldId, world.simTick, proposal.payload as DmReplyPayload);
  } else if (proposal.kind === "reply") {
    const payload = proposal.payload as ReplyPayload;
    logActivity({
      worldId: proposal.worldId,
      tick: world.simTick,
      actor: "publisher",
      action: "reply",
      status: "ok",
      summary: payload.text.slice(0, 120),
      refType: "proposal",
      refId: proposalId,
    });
  }

  db.update(proposals).set({ status: "executed" }).where(eq(proposals.id, proposalId)).run();
  logActivity({
    worldId: proposal.worldId,
    tick: world.simTick,
    actor: "publisher",
    action: "publish",
    status: "ok",
    summary: `published ${proposal.kind}`,
    refType: "proposal",
    refId: proposalId,
  });
}

/** Pending proposals older than 48 ticks → expired. Track A clock should call this each tick. */
export function expireStaleProposals(worldId: string, tick: number): void {
  const pending = db
    .select()
    .from(proposals)
    .where(and(eq(proposals.worldId, worldId), eq(proposals.status, "pending")))
    .all();
  for (const p of pending) {
    if (tick - p.createdTick < 48) continue;
    db.update(proposals).set({ status: "expired" }).where(eq(proposals.id, p.id)).run();
    logActivity({
      worldId,
      tick,
      actor: "system",
      action: "expire",
      status: "expired",
      summary: `proposal expired after ${tick - p.createdTick} ticks`,
      refType: "proposal",
      refId: p.id,
    });
  }
}
