import { GenesisForm } from "../_components/genesis-form";
import { getWorlds } from "@/lib/db/queries";
import { SectionHead } from "../_components/section-head";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  const existing = getWorlds();

  return (
    <div className="rise">
      <header className="border-b px-6 py-8 md:px-10 md:py-10">
        <p className="eyebrow">Genesis</p>
        <h1 className="display mt-2.5 max-w-2xl text-[2.25rem]">Grow a new world</h1>
        <p className="mt-3 max-w-lg text-[0.9rem] leading-relaxed text-muted-foreground">
          Describe a product and Flywheel builds a simulated Pictogram audience for it — with
          hidden ground truth the agent has to learn by posting.
        </p>
      </header>

      <div className="border-b">
        <GenesisForm />
      </div>

      {existing.length > 0 && (
        <section>
          <SectionHead title="Existing worlds" note="switch from the masthead" />
          <ul className="ruled">
            {existing.map((world) => (
              <li
                key={world.id}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-6 py-3 md:px-10"
              >
                <span className="display text-[1.15rem]">{world.name}</span>
                <span className="font-mono text-[0.68rem] text-muted-foreground">
                  {world.simLabel} · playbook v{world.playbookVersion} · {world.followers}{" "}
                  followers
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
