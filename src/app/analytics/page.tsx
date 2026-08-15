import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentWorld } from "../current-world";
import {
  getAttribution,
  getEraComparison,
  getFunnelSummary,
  type FunnelFilters,
} from "@/lib/db/queries";
import type { Archetype, TimeSlot } from "@/lib/types";
import { ARCHETYPES, TIME_SLOTS } from "@/lib/types";
import { AnalyticsFilters } from "../_components/analytics-filters";
import { SectionHead } from "../_components/section-head";

export const dynamic = "force-dynamic";

const VERDICT_COLOR: Record<string, string> = {
  exceeded: "text-signal",
  met: "text-muted-foreground",
  missed: "text-destructive",
};

function parseFilters(params: Record<string, string | string[] | undefined>): FunnelFilters {
  const archetype = typeof params.archetype === "string" ? params.archetype : undefined;
  const timeSlot = typeof params.timeSlot === "string" ? params.timeSlot : undefined;
  return {
    archetype: ARCHETYPES.includes(archetype as Archetype) ? (archetype as Archetype) : undefined,
    timeSlot: timeSlot && timeSlot in TIME_SLOTS ? (timeSlot as TimeSlot) : undefined,
  };
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const world = await getCurrentWorld();
  if (!world) redirect("/onboarding");

  const filters = parseFilters(await searchParams);
  const funnel = getFunnelSummary(world.id, filters);
  const attribution = getAttribution(world.id, filters);
  const eras = getEraComparison(world.id, filters);
  const top = funnel[0]?.count ?? 0;

  return (
    <div className="rise">
      <header className="border-b px-6 py-8 md:px-10 md:py-10">
        <p className="eyebrow">Scoreboard</p>
        <h1 className="display mt-2.5 text-[2.25rem]">Analytics</h1>
        <p className="mt-3 max-w-lg text-[0.9rem] leading-relaxed text-muted-foreground">
          Impressions through booked meetings — the only scoreboard that matters.
        </p>
      </header>

      <Suspense fallback={null}>
        <AnalyticsFilters />
      </Suspense>

      {/* funnel as a ruled ladder with proportional rules */}
      <section className="border-b">
        <SectionHead title="Funnel" note="conversion from the stage above" />
        <div className="ruled">
          {funnel.map((stage, i) => (
            <div key={stage.stage} className="flex items-baseline gap-4 px-6 py-3 md:px-10">
              <span className="w-28 shrink-0 text-[0.85rem] text-muted-foreground">
                {stage.stage}
              </span>
              <span className="relative hidden h-[1px] flex-1 bg-border sm:block">
                <span
                  className="absolute inset-y-0 left-0 bg-foreground"
                  style={{
                    width: `${top > 0 ? Math.max((stage.count / top) * 100, stage.count > 0 ? 1 : 0) : 0}%`,
                  }}
                />
              </span>
              <span className="figure w-16 shrink-0 text-right text-[1.35rem]">{stage.count}</span>
              <span className="w-16 shrink-0 text-right font-mono text-[0.68rem] text-muted-foreground tabular-nums">
                {i === 0 ? "—" : `${(stage.conversion * 100).toFixed(1)}%`}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="border-b">
        <SectionHead
          title="Playbook eras"
          note="rising click rate across eras is learning you can point at"
        />
        {eras.length === 0 ? (
          <p className="px-6 py-4 text-[0.85rem] text-muted-foreground md:px-10">
            No published posts match these filters.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 [&>*]:-mr-px [&>*]:border-r">
            {eras.map((era) => (
              <div key={era.version} className="px-6 py-4 md:px-10">
                <div className="flex items-baseline gap-2">
                  <span className="eyebrow">{era.label}</span>
                  <span className="font-mono text-[0.62rem] text-muted-foreground">
                    {era.posts} posts
                  </span>
                </div>
                <div className="figure mt-2 text-[1.85rem]">
                  {(era.clickRate * 100).toFixed(2)}%
                </div>
                <div className="mt-1.5 font-mono text-[0.65rem] text-muted-foreground">
                  click rate · {era.signups} signups · {era.meetings} meetings
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHead title="Attribution by post" note={`${attribution.length} posts`} />
        {attribution.length === 0 ? (
          <p className="px-6 py-10 text-center text-[0.85rem] text-muted-foreground md:px-10">
            No posts match these filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left">
              <thead>
                <tr className="border-b">
                  {["Post", "Archetype", "Slot", "Seen", "Likes", "Clicks", "Signups", "Verdict", "Era"].map(
                    (h, i) => (
                      <th
                        key={h}
                        className={`eyebrow px-3 py-2 font-normal ${i === 0 ? "pl-6 md:pl-10" : ""} ${
                          i >= 3 && i <= 6 ? "text-right" : ""
                        }`}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="ruled">
                {attribution.map((row) => (
                  <tr key={row.postId} className="align-baseline">
                    <td className="max-w-80 px-3 py-3 pl-6 md:pl-10">
                      <div className="truncate text-[0.85rem]">{row.caption}</div>
                      <div className="mt-0.5 font-mono text-[0.62rem] text-muted-foreground">
                        {row.topic} · {row.publishedLabel}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[0.78rem]">{row.archetype}</td>
                    <td className="px-3 py-3 text-[0.78rem]">{row.timeSlot ?? "—"}</td>
                    <td className="px-3 py-3 text-right font-mono text-[0.78rem] tabular-nums">
                      {row.metrics.impressions}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[0.78rem] tabular-nums">
                      {row.metrics.likes}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[0.78rem] tabular-nums">
                      {row.metrics.linkClicks}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[0.78rem] tabular-nums">
                      {row.metrics.signups}
                    </td>
                    <td className="px-3 py-3">
                      {row.verdict ? (
                        <span
                          className={`eyebrow ${VERDICT_COLOR[row.verdict] ?? "text-muted-foreground"}`}
                          title={row.summary ?? undefined}
                        >
                          {row.verdict}
                        </span>
                      ) : (
                        <span className="eyebrow opacity-50">pending</span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono text-[0.72rem] text-muted-foreground">
                      v{row.playbookVersion}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
