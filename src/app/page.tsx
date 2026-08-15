import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentWorld } from "./current-world";
import { getActivity, getFunnelSummary, getSettings } from "@/lib/db/queries";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="gap-1 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-heading text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

export default async function Page() {
  const world = await getCurrentWorld();
  if (!world) redirect("/onboarding");

  const funnel = getFunnelSummary(world.id);
  const settings = getSettings(world.id);
  const activity = getActivity(world.id, 8);
  const stage = (name: string) => funnel.find((s) => s.stage === name)?.count ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="font-heading text-xl font-semibold">{world.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{world.productDescription}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sim time" value={world.simLabel} hint={`${world.simTick} ticks elapsed`} />
        <Stat
          label="Followers"
          value={world.followers}
          hint={`of ${world.personaCount} personas on Pictogram`}
        />
        <Stat
          label="Playbook"
          value={`v${world.playbookVersion}`}
          hint={world.mode === "autopilot" ? "Autopilot" : "Propose mode"}
        />
        <Stat label="Meetings booked" value={stage("Meetings")} hint={`${stage("Signups")} signups`} />
      </div>

      <Card className="gap-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-sm font-medium">Funnel to date</h2>
          <Link href="/analytics" className="text-xs text-muted-foreground hover:text-foreground">
            Full analytics →
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {funnel.map((s) => (
            <div key={s.stage} className="min-w-24 flex-1 rounded-lg border px-3 py-2">
              <div className="text-xs text-muted-foreground">{s.stage}</div>
              <div className="font-heading text-lg font-semibold tabular-nums">{s.count}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="gap-3 p-4">
          <h2 className="font-heading text-sm font-medium">Guardrails</h2>
          {settings ? (
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>Max {settings.maxPostsPerDay} posts/day, {settings.maxDmsPerDay} DMs/day</li>
              <li>
                Quiet hours {settings.quietHours[0]}:00–{settings.quietHours[1]}:00
              </li>
              <li>Banned topics: {settings.bannedTopics.join(", ") || "none"}</li>
              <li>First-touch DMs and pricing posts always need approval</li>
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No settings row.</p>
          )}
        </Card>

        <Card className="gap-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-sm font-medium">Latest activity</h2>
            <Link href="/activity" className="text-xs text-muted-foreground hover:text-foreground">
              All →
            </Link>
          </div>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing yet — hit <span className="font-medium">Run heartbeat</span> to start the loop.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {activity.map((row) => (
                <li key={row.id} className="flex items-start gap-2">
                  <Badge variant="outline" className="mt-0.5 shrink-0 text-xs">
                    {row.actor}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{row.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
