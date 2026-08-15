import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentWorld } from "./current-world";
import { getActivity, getFunnelSummary, getSettings } from "@/lib/db/queries";
import { SectionHead } from "./_components/section-head";

export const dynamic = "force-dynamic";

/** Large serif figure over a tracked mono label — the page's typographic anchor. */
function Figure({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="px-6 py-5">
      <div className="eyebrow">{label}</div>
      <div
        className={`figure mt-2 text-[2.6rem] ${accent ? "text-signal" : ""}`}
      >
        {value}
      </div>
      {hint && <div className="mt-2 text-[0.78rem] text-muted-foreground">{hint}</div>}
    </div>
  );
}

export default async function Page() {
  const world = await getCurrentWorld();
  if (!world) redirect("/onboarding");

  const funnel = getFunnelSummary(world.id);
  const settings = getSettings(world.id);
  const activity = getActivity(world.id, 9);
  const stage = (name: string) => funnel.find((s) => s.stage === name)?.count ?? 0;
  const maxStage = Math.max(...funnel.map((s) => s.count), 1);

  return (
    <div className="rise">
      {/* masthead */}
      <header className="border-b px-6 py-10 md:px-10 md:py-14">
        <p className="eyebrow">Brand dossier</p>
        <h1 className="display mt-3 max-w-3xl text-[2.75rem] md:text-[3.75rem]">{world.name}</h1>
        <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-muted-foreground">
          {world.productDescription}
        </p>
      </header>

      {/* -mr-px hides the trailing rule of the last column at every breakpoint */}
      <div className="grid border-b sm:grid-cols-2 lg:grid-cols-4 [&>*]:-mr-px [&>*]:border-r [&>*]:border-b [&>*]:border-border">
        <Figure label="Sim clock" value={world.simLabel} hint={`${world.simTick} ticks elapsed`} />
        <Figure
          label="Followers"
          value={world.followers}
          hint={`of ${world.personaCount} personas on Pictogram`}
        />
        <Figure
          label="Playbook"
          value={`v${world.playbookVersion}`}
          hint={world.mode === "autopilot" ? "Autopilot engaged" : "Every action proposed"}
        />
        <Figure
          label="Meetings booked"
          value={stage("Meetings")}
          hint={`${stage("Signups")} signups upstream`}
          accent
        />
      </div>

      {/* funnel as a typographic ladder — no chart chrome */}
      <section className="border-b">
        <SectionHead title="Funnel to date" href="/analytics" cta="Full analytics" />
        <div className="ruled">
          {funnel.map((s) => (
            <div key={s.stage} className="flex items-baseline gap-4 px-6 py-3 md:px-10">
              <span className="w-28 shrink-0 text-[0.82rem] text-muted-foreground">{s.stage}</span>
              <span className="relative hidden h-[1px] flex-1 bg-border sm:block">
                <span
                  className="absolute inset-y-0 left-0 bg-foreground"
                  style={{ width: `${(s.count / maxStage) * 100}%` }}
                />
              </span>
              <span className="figure w-16 shrink-0 text-right text-[1.35rem]">{s.count}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid lg:grid-cols-2">
        <section className="border-b lg:border-r">
          <SectionHead title="Guardrails" />
          {settings ? (
            <dl className="ruled">
              {[
                ["Posts / day", String(settings.maxPostsPerDay)],
                ["DMs / day", String(settings.maxDmsPerDay)],
                ["Quiet hours", `${settings.quietHours[0]}:00 – ${settings.quietHours[1]}:00`],
                ["Banned topics", settings.bannedTopics.join(", ") || "none"],
                ["Always gated", "First-touch DMs · pricing posts"],
              ].map(([term, value]) => (
                <div key={term} className="flex items-baseline gap-4 px-6 py-3 md:px-10">
                  <dt className="w-32 shrink-0 text-[0.82rem] text-muted-foreground">{term}</dt>
                  <dd className="font-mono text-[0.78rem]">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="px-6 py-4 text-sm text-muted-foreground md:px-10">No settings row.</p>
          )}
        </section>

        <section className="border-b">
          <SectionHead title="Latest activity" href="/activity" cta="Full log" />
          {activity.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground md:px-10">
              Nothing yet — run a heartbeat to start the loop.
            </p>
          ) : (
            <ul className="ruled">
              {activity.map((row) => (
                <li key={row.id} className="flex items-baseline gap-4 px-6 py-2.5 md:px-10">
                  <span className="eyebrow w-20 shrink-0">{row.actor}</span>
                  <span className="min-w-0 flex-1 truncate text-[0.82rem] text-muted-foreground">
                    {row.summary}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="px-6 py-8 md:px-10">
        <Link href="/feed" className="eyebrow border-b border-signal pb-0.5 text-signal">
          Open the feed →
        </Link>
      </footer>
    </div>
  );
}
