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
    <div className="rise">
      <header className="border-b px-6 py-8 md:px-10 md:py-10">
        <p className="eyebrow">Inside the agent</p>
        <h1 className="display mt-2.5 text-[2.25rem]">Brain</h1>
        <p className="mt-3 max-w-lg text-[0.9rem] leading-relaxed text-muted-foreground">
          What it believes, what it is still testing, and whether its confidence is earned.
        </p>
      </header>

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
