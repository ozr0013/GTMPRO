import { describe, it, expect } from "vitest";
import { db } from "@/lib/db/client";
import { dmMessages, dmThreads, personas } from "@/lib/db/schema";
import { runPersonaDmReplies, replyChance } from "@/lib/sim/dm";
import { buildTinyWorld } from "./fixtures/world";
import type { PersonaHidden } from "@/lib/types";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";

function insertPersona(worldId: string, handle: string, hidden: PersonaHidden): string {
  const id = randomUUID();
  db.insert(personas)
    .values({
      id,
      worldId,
      handle,
      displayName: handle,
      bio: `test persona ${handle}`,
      segment: "coffee-nerds",
      hidden,
      isFollower: false,
      fatigue: 0,
    })
    .run();
  return id;
}

function insertThread(
  worldId: string,
  personaId: string,
  opts: { turnCount?: number; agentMsgTick?: number } = {},
): string {
  const id = randomUUID();
  db.insert(dmThreads)
    .values({ id, worldId, personaId, status: "open", turnCount: opts.turnCount ?? 1, createdTick: 1 })
    .run();
  db.insert(dmMessages)
    .values({ id: randomUUID(), threadId: id, sender: "persona", text: "Hey, curious about this.", tick: 1 })
    .run();
  db.insert(dmMessages)
    .values({
      id: randomUUID(),
      threadId: id,
      sender: "agent",
      text: "Happy to walk you through it!",
      tick: opts.agentMsgTick ?? 2,
    })
    .run();
  return id;
}

const EAGER: PersonaHidden = {
  interests: ["brewing-science"],
  skepticism: 0.0,
  engagementPropensity: 0.9,
  purchaseIntent: 0.9,
  dmOpenness: 1.0, // replyChance clamps to 0.9
  activeHours: [7, 8, 9],
};

const COLD: PersonaHidden = {
  interests: [],
  skepticism: 1.0,
  engagementPropensity: 0.1,
  purchaseIntent: 0.05,
  dmOpenness: 0.0, // replyChance clamps to 0.1
  activeHours: [7],
};

describe("persona DM continuation", () => {
  it("replyChance maps openness and skepticism into [0.1, 0.95]", () => {
    expect(replyChance(EAGER)).toBeCloseTo(0.9);
    expect(replyChance(COLD)).toBe(0.1);
  });

  it("an eager persona replies within the 2-6 tick window, handing the thread back", async () => {
    const { worldId } = buildTinyWorld("dm-eager-seed");
    const personaId = insertPersona(worldId, "eager-fan", EAGER);
    const threadId = insertThread(worldId, personaId, { agentMsgTick: 2 });

    let replied = 0;
    for (let t = 3; t <= 10 && replied === 0; t++) {
      replied = await runPersonaDmReplies(worldId, t);
    }
    expect(replied).toBe(1);
    const msgs = db.select().from(dmMessages).where(eq(dmMessages.threadId, threadId)).all();
    expect(msgs[msgs.length - 1].sender).toBe("persona");
    const thread = db.select().from(dmThreads).where(eq(dmThreads.id, threadId)).get()!;
    expect(thread.status).toBe("open"); // ready for the community runner again
  });

  it("is deterministic: same seed and thread state produce the same reply tick", async () => {
    const run = async (seed: string) => {
      const { worldId } = buildTinyWorld(seed);
      const personaId = insertPersona(worldId, "eager-fan", EAGER);
      insertThread(worldId, personaId, { agentMsgTick: 2 });
      for (let t = 3; t <= 10; t++) {
        if ((await runPersonaDmReplies(worldId, t)) > 0) return t;
      }
      return -1;
    };
    const a = await run("dm-det-seed");
    const b = await run("dm-det-seed");
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
  });

  it("a cold persona ghosts: thread closes after the reply window passes", async () => {
    // seed chosen so the 10% reply roll fails (verified by the assertion itself:
    // ghost path must trigger for this seed/handle/turn combination)
    const { worldId } = buildTinyWorld("dm-ghost-seed");
    const personaId = insertPersona(worldId, "cold-shoulder", COLD);
    const threadId = insertThread(worldId, personaId, { agentMsgTick: 2 });

    for (let t = 3; t <= 12; t++) {
      await runPersonaDmReplies(worldId, t);
    }
    const thread = db.select().from(dmThreads).where(eq(dmThreads.id, threadId)).get()!;
    expect(thread.status).toBe("closed");
    const personaMsgs = db
      .select()
      .from(dmMessages)
      .where(and(eq(dmMessages.threadId, threadId), eq(dmMessages.sender, "persona")))
      .all();
    expect(personaMsgs.length).toBe(1); // only the opener — no continuation
  });

  it("janitor closes threads whose 3-turn budget is spent", async () => {
    const { worldId } = buildTinyWorld("dm-janitor-seed");
    const personaId = insertPersona(worldId, "chatty", EAGER);
    const threadId = insertThread(worldId, personaId, { turnCount: 3 });
    await runPersonaDmReplies(worldId, 5);
    expect(db.select().from(dmThreads).where(eq(dmThreads.id, threadId)).get()!.status).toBe("closed");
  });
});
