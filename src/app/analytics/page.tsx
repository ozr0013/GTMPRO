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

export const dynamic = "force-dynamic";

// monochrome verdicts: exceeded = inverted ink, met = muted, missed = outlined
const VERDICT_STYLE: Record<string, string> = {
  exceeded: "bg-foreground text-background",
  met: "bg-muted text-muted-foreground",
  missed: "border border-foreground/50 text-foreground",
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
      <section className="mt-4 rounded-3xl bg-card px-6 py-10 md:px-12 md:py-12">
        <p className="eyebrow">Scoreboard</p>
        <h1 className="display mt-3 text-[2.75rem] md:text-[3.5rem]">Analytics</h1>
        <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-muted-foreground">
          Impressions through booked meetings — the only scoreboard that matters.
        </p>
      </section>

      <div className="mt-4 rounded-3xl bg-card px-6 py-4 md:px-8">
        <Suspense fallback={null}>
          <AnalyticsFilters />
        </Suspense>
      </div>

      <section className="mt-4 rounded-3xl bg-card px-6 py-7 md:px-8">
        <p className="eyebrow">Funnel</p>
        <h2 className="display-sm mt-2 text-[1.6rem]">Conversion from the stage above</h2>
        <div className="mt-6 space-y-3.5">
          {funnel.map((stage, i) => (
            <div key={stage.stage} className="flex items-center gap-4">
              <span className="w-24 shrink-0 text-[0.85rem] text-muted-foreground">
                {stage.stage}
              </span>
              <span className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-foreground"
                  style={{
                    width: `${top > 0 ? Math.max((stage.count / top) * 100, stage.count > 0 ? 2 : 0) : 0}%`,
                  }}
                />
              </span>
              <span className="figure w-14 shrink-0 text-right text-[1.35rem]">{stage.count}</span>
              <span className="w-16 shrink-0 text-right font-mono text-[0.7rem] text-muted-foreground tabular-nums">
                {i === 0 ? "—" : `${(stage.conversion * 100).toFixed(1)}%`}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4">
        <p className="eyebrow px-2">Playbook eras</p>
        <h2 className="display-sm mt-2 px-2 text-[1.6rem]">
          Rising click rate across eras is learning you can point at
        </h2>
        {eras.length === 0 ? (
          <div className="mt-4 rounded-3xl bg-card px-6 py-10 text-center text-[0.9rem] text-muted-foreground">
            No published posts match these filters.
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {eras.map((era) => (
              <div key={era.version} className="rounded-3xl bg-card px-6 py-6">
                <div className="flex items-baseline gap-2">
                  <span className="eyebrow">{era.label}</span>
                  <span className="font-mono text-[0.65rem] text-muted-foreground">
                    {era.posts} posts
                  </span>
                </div>
                <div className="figure mt-3 text-[2rem]">{(era.clickRate * 100).toFixed(2)}%</div>
                <div className="mt-2 text-[0.75rem] text-muted-foreground">
                  click rate · {era.signups} signups · {era.meetings} meetings
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-4 overflow-hidden rounded-3xl bg-card">
        <div className="px-6 py-6 md:px-8">
          <p className="eyebrow">Attribution by post</p>
          <h2 className="display-sm mt-2 text-[1.6rem]">{attribution.length} posts measured</h2>
        </div>
        {attribution.length === 0 ? (
          <p className="px-6 py-12 text-center text-[0.9rem] text-muted-foreground">
            No posts match these filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left">
              <thead>
                <tr className="border-y bg-muted/50">
                  {[
                    "Post",
                    "Archetype",
                    "Slot",
                    "Seen",
                    "Likes",
                    "Clicks",
                    "Signups",
                    "Verdict",
                    "Era",
                  ].map((h, i) => (
                    <th
                      key={h}
                      className={`eyebrow px-3 py-3 font-normal ${i === 0 ? "pl-6 md:pl-8" : ""} ${
                        i >= 3 && i <= 6 ? "text-right" : ""
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="ruled">
                {attribution.map((row) => (
                  <tr key={row.postId} className="align-baseline">
                    <td className="max-w-80 px-3 py-3.5 pl-6 md:pl-8">
                      <div className="truncate text-[0.88rem]">{row.caption}</div>
                      <div className="mt-0.5 font-mono text-[0.65rem] text-muted-foreground">
                        {row.topic} · {row.publishedLabel}
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-[0.8rem]">{row.archetype}</td>
                    <td className="px-3 py-3.5 text-[0.8rem]">{row.timeSlot ?? "—"}</td>
                    <td className="px-3 py-3.5 text-right font-mono text-[0.8rem] tabular-nums">
                      {row.metrics.impressions}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono text-[0.8rem] tabular-nums">
                      {row.metrics.likes}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono text-[0.8rem] tabular-nums">
                      {row.metrics.linkClicks}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono text-[0.8rem] tabular-nums">
                      {row.metrics.signups}
                    </td>
                    <td className="px-3 py-3.5">
                      {row.verdict ? (
                        <span
                          className={`rounded-full px-2.5 py-1 text-[0.62rem] font-bold tracking-wider uppercase ${VERDICT_STYLE[row.verdict] ?? "bg-muted"}`}
                          title={row.summary ?? undefined}
                        >
                          {row.verdict}
                        </span>
                      ) : (
                        <span className="eyebrow opacity-50">pending</span>
                      )}
                    </td>
                    <td className="px-3 py-3.5 font-mono text-[0.75rem] text-muted-foreground">
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
