import { redirect } from "next/navigation";
import { getCurrentWorld } from "../current-world";
import {
  getActivePlaybook,
  getArmDistributions,
  getCalibrationSeries,
  getPlaybookHistory,
} from "@/lib/db/queries";
import { BrainView } from "../_components/brain-view";

export const dynamic = "force-dynamic";

export default async function BrainPage() {
  const world = await getCurrentWorld();
  if (!world) redirect("/onboarding");

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div>
        <h1 className="font-heading text-xl font-semibold">Brain</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What the agent believes, what it is still testing, and whether its confidence is earned.
        </p>
      </div>

      <BrainView
        worldId={world.id}
        playbook={getActivePlaybook(world.id)}
        history={getPlaybookHistory(world.id)}
        arms={getArmDistributions(world.id)}
        calibration={getCalibrationSeries(world.id)}
      />
    </div>
  );
}
