// Persona-side DM behavior (Track A): personas reply to the agent's DM messages on
// later ticks — or ghost — so conversations actually progress toward qualification
// instead of stalling after the first agent reply. The community runner (Track B)
// answers whenever a thread's last message is from the persona; this module is the
// other half of that conversation loop.

import { db } from "@/lib/db/client";
import { dmMessages, dmThreads, personas, worlds } from "@/lib/db/schema";
import type { PersonaHidden } from "@/lib/types";
import { subRng } from "@/lib/rng";
import { callAgent } from "@/lib/agents/models";
import { SYSTEM } from "@/lib/agents/prompts";
import { PersonaVoiceOutput } from "@/lib/contracts";
import { logActivity } from "@/lib/agents/log";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

/** Chance a persona keeps the conversation going, from hidden state. */
export function replyChance(hidden: PersonaHidden): number {
  const raw = 0.35 + 0.55 * hidden.dmOpenness - 0.35 * hidden.skepticism;
  return Math.min(0.95, Math.max(0.1, raw));
}

/**
 * Advance persona sides of open DM threads at this tick.
 * - Threads whose 3-turn budget is spent get closed (janitor).
 * - Threads waiting on the persona (last message from agent): a seeded, stable roll
 *   decides ghost-vs-reply and the reply delay (2-6 ticks); when due, the persona
 *   writes an in-character message, handing the thread back to the community runner.
 * Returns the number of persona replies written.
 */
export async function runPersonaDmReplies(worldId: string, tick: number): Promise<number> {
  const world = db.select().from(worlds).where(eq(worlds.id, worldId)).get()!;
  const openThreads = db
    .select()
    .from(dmThreads)
    .where(and(eq(dmThreads.worldId, worldId), eq(dmThreads.status, "open")))
    .all();

  let replies = 0;
  for (const thread of openThreads) {
    // janitor: conversation budget exhausted without qualification → closed
    if (thread.turnCount >= 3) {
      db.update(dmThreads).set({ status: "closed" }).where(eq(dmThreads.id, thread.id)).run();
      logActivity({
        worldId,
        tick,
        actor: "system",
        action: "dm_thread_closed",
        status: "closed",
        summary: "DM thread hit the 3-turn budget without qualification",
        refType: "thread",
        refId: thread.id,
      });
      continue;
    }

    const msgs = db
      .select()
      .from(dmMessages)
      .where(eq(dmMessages.threadId, thread.id))
      .all()
      .sort((a, b) => a.tick - b.tick);
    const last = msgs[msgs.length - 1];
    if (!last || last.sender !== "agent") continue;

    const persona = db.select().from(personas).where(eq(personas.id, thread.personaId)).get()!;
    const hidden = persona.hidden as PersonaHidden;

    // One stable stream per (persona, conversation turn): re-created identically on
    // every tick, so the ghost/reply decision and delay never flip between ticks.
    const rng = subRng(world.seed, "dm-continue", persona.handle, thread.turnCount);
    const ghosts = rng() > replyChance(hidden);
    const delay = 2 + Math.floor(rng() * 5); // 2..6 ticks after the agent's message

    if (ghosts) {
      // ghost once the reply window has clearly passed (gives the feed a realistic lag)
      if (tick >= last.tick + delay) {
        db.update(dmThreads).set({ status: "closed" }).where(eq(dmThreads.id, thread.id)).run();
        logActivity({
          worldId,
          tick,
          actor: "system",
          action: "dm_ghosted",
          status: "closed",
          summary: `@${persona.handle} stopped responding`,
          refType: "thread",
          refId: thread.id,
        });
      }
      continue;
    }

    if (tick < last.tick + delay) continue; // reply not due yet

    const voice = await callAgent(
      "persona",
      PersonaVoiceOutput,
      SYSTEM.persona,
      [
        `You are @${persona.handle} (${persona.segment}); bio: ${persona.bio}.`,
        `Purchase intent ${hidden.purchaseIntent.toFixed(2)}, skepticism ${hidden.skepticism.toFixed(2)}.`,
        `You are in a DM with a brand. Conversation so far:`,
        ...msgs.map((m) => `${m.sender === "agent" ? "Brand" : "You"}: ${m.text}`),
        `Write your next short DM reply — interested but true to your skepticism level.`,
      ].join("\n"),
      { worldSeed: world.seed, refId: `dm-cont-${persona.handle}-${thread.turnCount}` },
    );

    db.insert(dmMessages)
      .values({
        id: randomUUID(),
        threadId: thread.id,
        sender: "persona",
        text: voice.ok ? voice.data.commentText : "Sorry, got busy — still curious though.",
        tick,
      })
      .run();
    replies++;
  }
  return replies;
}
