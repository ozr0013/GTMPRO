import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentWorld } from "./current-world";
import {
  getActivePlaybook,
  getActivity,
  getFunnelSummary,
  getSettings,
} from "@/lib/db/queries";
import { SectionHead } from "./_components/section-head";
import { StatArt } from "./_components/stat-art";

export const dynamic = "force-dynamic";

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-3xl bg-card px-6 py-6">
      <div className="eyebrow">{label}</div>
      <div className="figure mt-3 text-[2.5rem]">{value}</div>
      {hint && <div className="mt-2 text-[0.8rem] text-muted-foreground">{hint}</div>}
    </div>
  );
}

export default async function Page() {
  const world = await getCurrentWorld();
  if (!world) redirect("/onboarding");

  const funnel = getFunnelSummary(world.id);
  const settings = getSettings(world.id);
  const playbook = getActivePlaybook(world.id);
  const activity = getActivity(world.id, 8);
  const stage = (name: string) => funnel.find((s) => s.stage === name)?.count ?? 0;
  const maxStage = Math.max(...funnel.map((s) => s.count), 1);

  return (
    <div className="rise">
      {/* masthead card */}
      <section className="mt-4 rounded-3xl bg-card px-6 py-12 md:px-12 md:py-16">
        <p className="eyebrow">Brand dossier</p>
        <h1 className="display mt-4 max-w-4xl text-[3rem] md:text-[4.5rem]">{world.name}</h1>
        <p className="mt-5 max-w-xl text-[1rem] leading-relaxed text-muted-foreground">
          {world.productDescription}
        </p>
      </section>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sim clock" value={world.simLabel} hint={`${world.simTick} ticks elapsed`} />
        <StatCard
          label="Followers"
          value={world.followers}
          hint={`of ${world.personaCount} personas on Pictogram`}
        />
        <StatCard
          label="Playbook"
          value={`v${world.playbookVersion}`}
          hint={`${playbook.rules.length} active rules`}
        />
        <StatCard
          label="Meetings booked"
          value={stage("Meetings")}
          hint={`${stage("Signups")} signups upstream`}
        />
      </div>

      <SectionHead
        title="What The Agent Has Done"
        note="Every number here was earned by the loop — nothing is seeded."
      />

      {/* three-card pattern: graphic block, then eyebrow / title / copy */}
      <div className="grid gap-4 lg:grid-cols-3">
        <article className="flex flex-col rounded-3xl bg-card">
          <StatArt value={String(stage("Impressions"))} label="Reach" />
          <div className="mt-auto px-8 pt-2 pb-8 text-center">
            <p className="eyebrow">Reach</p>
            <h3 className="display-sm mt-2 text-[1.5rem]">Impressions earned</h3>
            <p className="mt-3 text-[0.85rem] leading-relaxed text-muted-foreground">
              Organic only. The algorithm decides who sees each post, and the agent has to learn
              what it rewards.
            </p>
          </div>
        </article>

        <article className="flex flex-col rounded-3xl bg-card">
          <div className="px-8 py-10">
            {/* funnel bars stand in for the card's graphic slot */}
            <div className="space-y-2.5">
              {funnel.map((s) => (
                <div key={s.stage} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-[0.7rem] text-muted-foreground">
                    {s.stage}
                  </span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-foreground"
                      style={{
                        width: `${Math.max((s.count / maxStage) * 100, s.count > 0 ? 3 : 0)}%`,
                      }}
                    />
                  </span>
                  <span className="w-8 shrink-0 text-right font-mono text-[0.75rem] tabular-nums">
                    {s.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-auto px-8 pt-2 pb-8 text-center">
            <p className="eyebrow">Pipeline</p>
            <h3 className="display-sm mt-2 text-[1.5rem]">Impressions to meetings</h3>
            <p className="mt-3 text-[0.85rem] leading-relaxed text-muted-foreground">
              The full funnel, not vanity metrics. Every stage is a simulated persona deciding to
              act.
            </p>
            <Link
              href="/analytics"
              className="mt-4 inline-block text-[0.7rem] font-bold tracking-widest uppercase hover:text-muted-foreground"
            >
              Full analytics →
            </Link>
          </div>
        </article>

        <article className="flex flex-col rounded-3xl bg-card">
          <StatArt value={`v${world.playbookVersion}`} label="Learning" />
          <div className="mt-auto px-8 pt-2 pb-8 text-center">
            <p className="eyebrow">Learning</p>
            <h3 className="display-sm mt-2 text-[1.5rem]">Playbook rewritten</h3>
            <p className="mt-3 text-[0.85rem] leading-relaxed text-muted-foreground">
              {playbook.rules.length} active rules, each traceable to an outcome, a rejection, or
              one of your edits.
            </p>
            <Link
              href="/brain"
              className="mt-4 inline-block text-[0.7rem] font-bold tracking-widest uppercase hover:text-muted-foreground"
            >
              Open the brain →
            </Link>
          </div>
        </article>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl bg-card px-8 py-7">
          <p className="eyebrow">Guardrails</p>
          <h3 className="display-sm mt-2 text-[1.5rem]">What it may never do</h3>
          {settings ? (
            <dl className="mt-5 space-y-3">
              {[
                ["Posts / day", String(settings.maxPostsPerDay)],
                ["DMs / day", String(settings.maxDmsPerDay)],
                ["Quiet hours", `${settings.quietHours[0]}:00 – ${settings.quietHours[1]}:00`],
                ["Banned topics", settings.bannedTopics.join(", ") || "none"],
                ["Always gated", "First-touch DMs · pricing posts"],
              ].map(([term, value]) => (
                <div
                  key={term}
                  className="flex items-baseline justify-between gap-4 border-b pb-2.5"
                >
                  <dt className="text-[0.85rem] text-muted-foreground">{term}</dt>
                  <dd className="font-mono text-[0.78rem]">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No settings row.</p>
          )}
        </section>

        <section className="rounded-3xl bg-card px-8 py-7">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <p className="eyebrow">Latest activity</p>
              <h3 className="display-sm mt-2 text-[1.5rem]">What just happened</h3>
            </div>
            <Link
              href="/activity"
              className="shrink-0 text-[0.7rem] font-bold tracking-widest uppercase hover:text-muted-foreground"
            >
              Full log →
            </Link>
          </div>
          {activity.length === 0 ? (
            <p className="mt-5 text-[0.85rem] text-muted-foreground">
              Nothing yet — run a heartbeat to start the loop.
            </p>
          ) : (
            <ul className="mt-5 space-y-2.5">
              {activity.map((row) => (
                <li key={row.id} className="flex items-baseline gap-3 border-b pb-2.5">
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
    </div>
  );
}
