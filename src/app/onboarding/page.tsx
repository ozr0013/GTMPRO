import { GenesisForm } from "../_components/genesis-form";
import { getWorlds } from "@/lib/db/queries";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  const existing = getWorlds();

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-6">
      <div>
        <h1 className="font-heading text-xl font-semibold">Grow a new world</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe a product and Flywheel builds a simulated Pictogram audience for it — with hidden
          ground truth the agent has to learn by posting.
        </p>
      </div>

      <GenesisForm />

      {existing.length > 0 && (
        <Card className="gap-2 p-4">
          <h2 className="font-heading text-sm font-medium">Existing worlds</h2>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {existing.map((world) => (
              <li key={world.id} className="flex items-center gap-2">
                <span className="font-medium text-foreground">{world.name}</span>
                <span className="text-xs">
                  {world.simLabel} · playbook v{world.playbookVersion} · {world.followers} followers
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Switch between them from the top bar.</p>
        </Card>
      )}
    </div>
  );
}
