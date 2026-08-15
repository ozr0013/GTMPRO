import { GenesisForm } from "../_components/genesis-form";
import { getWorlds } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  const existing = getWorlds();

  return (
    <div className="rise mx-auto max-w-4xl">
      <section className="mt-4 rounded-3xl bg-card px-6 py-10 md:px-12 md:py-14">
        <p className="eyebrow">Genesis</p>
        <h1 className="display mt-3 max-w-2xl text-[2.75rem] md:text-[3.5rem]">
          Grow a new world
        </h1>
        <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-muted-foreground">
          Describe a product and Flywheel builds a simulated Pictogram audience for it — with
          hidden ground truth the agent has to learn by posting.
        </p>
      </section>

      <div className="mt-4 rounded-3xl bg-card">
        <GenesisForm />
      </div>

      {existing.length > 0 && (
        <section className="mt-4 rounded-3xl bg-card px-6 py-6 md:px-8">
          <p className="eyebrow">Existing worlds</p>
          <h2 className="display-sm mt-2 text-[1.4rem]">Switch from the control deck</h2>
          <ul className="ruled mt-4">
            {existing.map((world) => (
              <li key={world.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3">
                <span className="display-sm text-[1.15rem]">{world.name}</span>
                <span className="font-mono text-[0.7rem] text-muted-foreground">
                  {world.simLabel} · playbook v{world.playbookVersion} · {world.followers} followers
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
