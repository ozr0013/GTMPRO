import { describe, it, expect } from "vitest";
import { buildTinyWorld } from "./fixtures/world";
import { db } from "@/lib/db/client";
import { settings, posts } from "@/lib/db/schema";
import { checkGuardrails } from "@/lib/learning/guardrails";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

describe("guardrails single gate", () => {
  it("blocks past the posts/day cap", () => {
    const { worldId } = buildTinyWorld("gr-seed");
    for (let i = 0; i < 3; i++) {
      db.insert(posts)
        .values({
          id: randomUUID(),
          worldId,
          authorType: "brand",
          archetype: "meme",
          topic: "t",
          caption: "c",
          hashtags: [],
          creativeBrief: "b",
          scheduledTick: 8,
          publishedTick: 8,
          status: "published",
        })
        .run();
    }
    const res = checkGuardrails(worldId, { kind: "post", topic: "t", scheduledTick: 9, riskClass: "normal" });
    expect(res.allowed).toBe(false);
    expect(res.reasons.join(" ")).toMatch(/cap/i);
  });

  it("blocks banned topics and quiet hours; sensitive always requires approval in autopilot", () => {
    const { worldId } = buildTinyWorld("gr-seed-2");
    db.update(settings).set({ mode: "autopilot" }).where(eq(settings.worldId, worldId)).run();
    expect(
      checkGuardrails(worldId, { kind: "post", topic: "politics", scheduledTick: 9, riskClass: "normal" }).allowed,
    ).toBe(false);
    expect(
      checkGuardrails(worldId, { kind: "post", topic: "t", scheduledTick: 23, riskClass: "normal" }).allowed,
    ).toBe(false);
    const dm = checkGuardrails(worldId, { kind: "dm_reply", topic: "t", scheduledTick: 9, riskClass: "sensitive" });
    expect(dm.allowed).toBe(true);
    expect(dm.requiresApproval).toBe(true);
  });
});
