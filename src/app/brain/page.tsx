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
      <section className="mt-4 rounded-3xl bg-card px-6 py-10 md:px-12 md:py-12">
        <p className="eyebrow">Inside the agent</p>
        <h1 className="display mt-3 text-[2.75rem] md:text-[3.5rem]">Brain</h1>
        <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-muted-foreground">
          What it believes, what it is still testing, and whether its confidence is earned.
        </p>
      </section>

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
