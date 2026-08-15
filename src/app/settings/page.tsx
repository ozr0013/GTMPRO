import { redirect } from "next/navigation";
import { getCurrentWorld } from "../current-world";
import { getSettings } from "@/lib/db/queries";
import { slackReadiness } from "@/lib/notify/slack";
import { ALL_KINDS } from "@/lib/notify/activityNotifier";
import { SlackSettings } from "../_components/slack-settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const world = await getCurrentWorld();
  if (!world) redirect("/onboarding");

  const settings = getSettings(world.id);
  const readiness = slackReadiness(settings?.slackTarget);

  return (
    <div className="rise mx-auto max-w-4xl">
      <section className="mt-4 rounded-3xl bg-card px-6 py-10 md:px-12 md:py-12">
        <p className="eyebrow">Configuration</p>
        <h1 className="display mt-3 text-[2.75rem] md:text-[3.5rem]">Settings</h1>
        <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-muted-foreground">
          How the agent reaches you, and the hard limits it operates inside.
        </p>
      </section>

      <SlackSettings
        worldId={world.id}
        enabled={settings?.slackEnabled ?? false}
        target={settings?.slackTarget ?? ""}
        kinds={settings?.slackNotify ?? ALL_KINDS}
        readiness={readiness}
      />

      {/* read-only for now: these are enforced in checkGuardrails, the single gate */}
      <section className="mt-4 rounded-3xl bg-card px-6 py-7 md:px-8">
        <p className="eyebrow">Guardrails</p>
        <h2 className="display-sm mt-2 text-[1.6rem]">Hard limits</h2>
        {settings ? (
          <dl className="mt-5 space-y-3">
            {[
              ["Posts / day", String(settings.maxPostsPerDay)],
              ["DMs / day", String(settings.maxDmsPerDay)],
              ["Quiet hours", `${settings.quietHours[0]}:00 – ${settings.quietHours[1]}:00`],
              ["Banned topics", settings.bannedTopics.join(", ") || "none"],
              ["Image budget", String(settings.imageBudget)],
              ["Always gated", "First-touch DMs · pricing posts"],
            ].map(([term, value]) => (
              <div key={term} className="flex items-baseline justify-between gap-4 border-b pb-2.5">
                <dt className="text-[0.85rem] text-muted-foreground">{term}</dt>
                <dd className="font-mono text-[0.78rem]">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No settings row.</p>
        )}
        <p className="mt-4 text-[0.78rem] text-muted-foreground">
          Enforced in one place — <span className="font-mono text-[0.72rem]">checkGuardrails</span>{" "}
          — which every action passes through, including Autopilot.
        </p>
      </section>
    </div>
  );
}
