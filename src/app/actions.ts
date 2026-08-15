"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { proposals, settings } from "@/lib/db/schema";
import type { PostPayload } from "@/lib/types";
import { runHeartbeat, decideProposal } from "@/lib/agents/orchestrator";
import { advanceTicks } from "@/lib/sim/clock";
import { eq } from "drizzle-orm";

export async function advanceTicksAction(worldId: string, n: number): Promise<void> {
  await advanceTicks(worldId, n);
  revalidatePath("/", "layout");
}

export async function heartbeatAction(worldId: string): Promise<void> {
  await runHeartbeat(worldId);
  revalidatePath("/", "layout");
}

export async function decideAction(
  proposalId: string,
  decision: "approve" | "reject" | "edit",
  reason?: string,
  editedCaption?: string,
): Promise<void> {
  if (decision === "edit") {
    const proposal = db.select().from(proposals).where(eq(proposals.id, proposalId)).get();
    const payload = (proposal?.payload ?? {}) as PostPayload;
    await decideProposal(proposalId, "edit", {
      editedPayload: { ...payload, caption: editedCaption ?? payload.caption },
    });
  } else {
    await decideProposal(proposalId, decision, { reason });
  }
  revalidatePath("/", "layout");
}

export async function togglePauseAction(worldId: string): Promise<void> {
  const current = db.select().from(settings).where(eq(settings.worldId, worldId)).get();
  if (current) {
    db.update(settings).set({ paused: !current.paused }).where(eq(settings.worldId, worldId)).run();
  }
  revalidatePath("/", "layout");
}

export async function setModeAction(worldId: string, mode: "propose" | "autopilot"): Promise<void> {
  db.update(settings).set({ mode }).where(eq(settings.worldId, worldId)).run();
  revalidatePath("/", "layout");
}
