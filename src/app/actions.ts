"use server";

// Thin wrappers only — no business logic lives here. Every mutation delegates to
// src/lib and then revalidates, so pages re-read through queries.ts.

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { WORLD_COOKIE } from "./current-world";
import { db } from "@/lib/db/client";
import { settings, proposals } from "@/lib/db/schema";
import { advanceTicks } from "@/lib/sim/clock";
import { generateWorld } from "@/lib/sim/genesis";
import { decideProposal, runHeartbeat } from "@/lib/agents/orchestrator";
import { generateHeroImage } from "@/lib/agents/artdirector";
import { logActivity } from "@/lib/agents/log";
import { rollbackTo } from "@/lib/learning/playbook";
import { sendSlack } from "@/lib/notify/slack";
import { getWorld } from "@/lib/db/queries";
import type { PostPayload } from "@/lib/types";
import { eq } from "drizzle-orm";

type Decision = "approve" | "reject" | "edit";

function refreshAll() {
  revalidatePath("/", "layout");
}

export async function advanceTicksAction(worldId: string, n: number): Promise<void> {
  await advanceTicks(worldId, n);
  refreshAll();
}

export async function heartbeatAction(worldId: string): Promise<void> {
  await runHeartbeat(worldId);
  refreshAll();
}

export async function decideAction(
  proposalId: string,
  decision: Decision,
  reason?: string,
  editedCaption?: string,
): Promise<void> {
  let editedPayload: PostPayload | undefined;
  if (decision === "edit" && editedCaption) {
    const proposal = db.select().from(proposals).where(eq(proposals.id, proposalId)).get();
    if (proposal) {
      editedPayload = { ...(proposal.payload as PostPayload), caption: editedCaption };
    }
  }
  await decideProposal(proposalId, decision, { reason, editedPayload });
  refreshAll();
}

export async function togglePauseAction(worldId: string): Promise<void> {
  const current = db.select().from(settings).where(eq(settings.worldId, worldId)).get();
  if (!current) return;
  db.update(settings).set({ paused: !current.paused }).where(eq(settings.worldId, worldId)).run();
  logActivity({
    worldId,
    tick: getWorld(worldId)?.simTick ?? 0,
    actor: "human",
    action: current.paused ? "resume" : "pause",
    status: "ok",
    summary: current.paused ? "Agent resumed" : "Agent paused (kill switch)",
  });
  refreshAll();
}

export async function setModeAction(worldId: string, mode: "propose" | "autopilot"): Promise<void> {
  db.update(settings).set({ mode }).where(eq(settings.worldId, worldId)).run();
  logActivity({
    worldId,
    tick: getWorld(worldId)?.simTick ?? 0,
    actor: "human",
    action: "set_mode",
    status: "ok",
    summary: `Autonomy set to ${mode}`,
  });
  refreshAll();
}

export async function rollbackAction(worldId: string, targetVersion: number): Promise<void> {
  const tick = getWorld(worldId)?.simTick ?? 0;
  rollbackTo(worldId, targetVersion, tick);
  logActivity({
    worldId,
    tick,
    actor: "human",
    action: "rollback",
    status: "ok",
    summary: `Rolled the playbook back to v${targetVersion}`,
    refType: "playbook_version",
    refId: String(targetVersion),
  });
  refreshAll();
}

export async function generateHeroImageAction(
  postId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const result = await generateHeroImage(postId);
  refreshAll();
  return { ok: result.ok, reason: result.reason };
}

export async function saveSlackSettingsAction(
  worldId: string,
  input: { enabled: boolean; target: string; kinds: string[] },
): Promise<void> {
  db.update(settings)
    .set({
      slackEnabled: input.enabled,
      slackTarget: input.target.trim() || null,
      slackNotify: input.kinds,
    })
    .where(eq(settings.worldId, worldId))
    .run();
  logActivity({
    worldId,
    tick: getWorld(worldId)?.simTick ?? 0,
    actor: "human",
    action: "slack_settings",
    status: "ok",
    summary: input.enabled
      ? `Slack notifications on → ${input.target.trim() || "(env default)"}`
      : "Slack notifications off",
    detail: { kinds: input.kinds },
  });
  refreshAll();
}

/** Send a test message using the saved target, so the UI can prove delivery. */
export async function testSlackAction(
  worldId: string,
): Promise<{ sent: boolean; reason?: string }> {
  const config = db.select().from(settings).where(eq(settings.worldId, worldId)).get();
  const world = getWorld(worldId);
  return sendSlack(
    {
      kind: "approval",
      worldName: world?.name ?? "Flywheel",
      title: "Test from Flywheel",
      body: "If you can read this on your phone, approvals will reach you here.",
      fields: { Agent: "human", Action: "test", "Sim time": world?.simLabel ?? "—" },
      path: "/approvals",
    },
    config?.slackTarget ?? null,
  );
}

export async function selectWorldAction(worldId: string): Promise<void> {
  (await cookies()).set(WORLD_COOKIE, worldId, { httpOnly: true, sameSite: "lax", path: "/" });
  refreshAll();
}

export interface GenesisResult {
  worldId: string;
  name: string;
  segments: string[];
  topics: string[];
  personaCount: number;
}

export async function createWorldAction(
  name: string,
  productDescription: string,
): Promise<GenesisResult> {
  const { worldId, segments, topics } = await generateWorld(productDescription, { name });
  (await cookies()).set(WORLD_COOKIE, worldId, { httpOnly: true, sameSite: "lax", path: "/" });
  refreshAll();
  return {
    worldId,
    name,
    segments,
    topics,
    personaCount: getWorld(worldId)?.personaCount ?? 0,
  };
}
