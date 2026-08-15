// Track C → Track B: regression guard for the community runner. Kept in its own
// file rather than appended to runners.test.ts to avoid a merge seam; fold it in
// there whenever convenient.

import { describe, it, expect } from "vitest";
import { buildTinyWorld } from "./fixtures/world";
import { db } from "@/lib/db/client";
import { dmMessages, dmThreads, personas, proposals } from "@/lib/db/schema";
import { runCommunityPass } from "@/lib/agents/communityRunner";
import { advanceTicks } from "@/lib/sim/clock";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";

function openThreadWithPersonaMessage(worldId: string, tick = 1) {
  const persona = db.select().from(personas).where(eq(personas.worldId, worldId)).all()[0];
  const threadId = randomUUID();
  db.insert(dmThreads)
    .values({ id: threadId, worldId, personaId: persona.id, status: "open", turnCount: 0, createdTick: tick })
    .run();
  db.insert(dmMessages)
    .values({ id: randomUUID(), threadId, sender: "persona", text: "Is this good for cold brew?", tick })
    .run();
  return threadId;
}

const dmProposals = (worldId: string) =>
  db
    .select()
    .from(proposals)
    .where(and(eq(proposals.worldId, worldId), eq(proposals.kind, "dm_reply")))
    .all();

describe("community runner does not re-propose while a reply is pending", () => {
  it("proposes once across repeated passes on the same thread", async () => {
    const { worldId } = buildTinyWorld("community-dedupe");
    openThreadWithPersonaMessage(worldId);

    for (let i = 0; i < 5; i++) await runCommunityPass(worldId);

    // first touch is sensitive, so it sits pending — exactly one, not one per pass
    const pending = dmProposals(worldId).filter((p) => p.status === "pending");
    expect(pending).toHaveLength(1);
    expect(dmProposals(worldId)).toHaveLength(1);
  });

  it("does not flood approvals as the clock advances", async () => {
    const { worldId } = buildTinyWorld("community-dedupe-clock");
    openThreadWithPersonaMessage(worldId);

    // the clock calls runCommunityPass every tick; a full sim day must not
    // produce a proposal per tick for one unanswered thread
    await advanceTicks(worldId, 24);

    const forThread = dmProposals(worldId).filter((p) => p.status === "pending");
    expect(forThread.length).toBeLessThanOrEqual(1);
  });
});
