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
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const VERDICT_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  exceeded: "default",
  met: "secondary",
  missed: "destructive",
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
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="font-heading text-xl font-semibold">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Impressions through booked meetings — the only scoreboard that matters.
        </p>
      </div>

      <Suspense fallback={null}>
        <AnalyticsFilters />
      </Suspense>

      <Card className="gap-3 p-4">
        <h2 className="font-heading text-sm font-medium">Funnel</h2>
        <div className="space-y-1.5">
          {funnel.map((stage, i) => (
            <div key={stage.stage} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs text-muted-foreground">{stage.stage}</span>
              <div className="h-6 flex-1 overflow-hidden rounded bg-muted">
                <div
                  className="h-full rounded bg-primary/80 transition-all"
                  style={{ width: top > 0 ? `${Math.max((stage.count / top) * 100, stage.count > 0 ? 1.5 : 0)}%` : "0%" }}
                />
              </div>
              <span className="w-14 shrink-0 text-right font-heading text-sm font-semibold tabular-nums">
                {stage.count}
              </span>
              <span className="w-14 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">
                {i === 0 ? "" : `${(stage.conversion * 100).toFixed(1)}%`}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="gap-3 p-4">
        <div>
          <h2 className="font-heading text-sm font-medium">Playbook eras</h2>
          <p className="text-xs text-muted-foreground">
            Posts grouped by the playbook version they ran under. Rising click rate across eras is
            learning you can point at.
          </p>
        </div>
        {eras.length === 0 ? (
          <p className="text-sm text-muted-foreground">No published posts yet.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {eras.map((era) => (
              <div key={era.version} className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{era.label}</Badge>
                  <span className="text-[10px] text-muted-foreground">{era.posts} posts</span>
                </div>
                <div className="mt-2 font-heading text-xl font-semibold tabular-nums">
                  {(era.clickRate * 100).toFixed(2)}%
                </div>
                <div className="text-[10px] text-muted-foreground">
                  click rate · {era.signups} signups · {era.meetings} meetings
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b px-4 py-3">
          <h2 className="font-heading text-sm font-medium">Attribution by post</h2>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Post</TableHead>
                <TableHead className="w-24">Archetype</TableHead>
                <TableHead className="w-20">Slot</TableHead>
                <TableHead className="w-16 text-right">Seen</TableHead>
                <TableHead className="w-16 text-right">Likes</TableHead>
                <TableHead className="w-16 text-right">Clicks</TableHead>
                <TableHead className="w-20 text-right">Signups</TableHead>
                <TableHead className="w-24">Verdict</TableHead>
                <TableHead className="w-16">Era</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attribution.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                    No posts match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                attribution.map((row) => (
                  <TableRow key={row.postId}>
                    <TableCell className="max-w-72">
                      <div className="truncate text-sm">{row.caption}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {row.topic} · {row.publishedLabel}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs capitalize">{row.archetype}</TableCell>
                    <TableCell className="text-xs capitalize">{row.timeSlot ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {row.metrics.impressions}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{row.metrics.likes}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {row.metrics.linkClicks}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {row.metrics.signups}
                    </TableCell>
                    <TableCell>
                      {row.verdict ? (
                        <Badge variant={VERDICT_VARIANT[row.verdict] ?? "outline"} className="text-[10px]" title={row.summary ?? undefined}>
                          {row.verdict}
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">pending</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">v{row.playbookVersion}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
