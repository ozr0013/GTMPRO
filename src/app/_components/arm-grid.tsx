"use client";

import type { ArmView } from "@/lib/db/queries";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { TrophyIcon } from "lucide-react";

/** Beta posterior as a filled area — a wide hump means "still uncertain". */
function DensityStrip({ density, highlight }: { density: number[]; highlight: boolean }) {
  const width = 100;
  const height = 24;
  const step = width / (density.length - 1);
  const points = density.map((d, i) => `${(i * step).toFixed(2)},${(height - d * height).toFixed(2)}`);
  const area = `0,${height} ${points.join(" ")} ${width},${height}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-6 w-full" preserveAspectRatio="none" aria-hidden>
      <polygon
        points={area}
        className={cn(highlight ? "fill-primary/25" : "fill-muted-foreground/15")}
      />
      <polyline
        points={points.join(" ")}
        fill="none"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        className={cn(highlight ? "stroke-primary" : "stroke-muted-foreground/50")}
      />
    </svg>
  );
}

export function ArmGrid({ arms }: { arms: ArmView[] }) {
  const archetypes = [...new Set(arms.map((a) => a.archetype))];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Twelve arms — four archetypes across three time slots. Thompson sampling draws from each
        posterior and plays the winner, so a wide curve still gets explored.
      </p>

      {archetypes.map((archetype) => (
        <div key={archetype}>
          <h3 className="mb-2 font-heading text-sm font-medium capitalize">{archetype}</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            {arms
              .filter((a) => a.archetype === archetype)
              .map((arm) => (
                <div
                  key={arm.id}
                  className={cn(
                    "rounded-xl border p-3",
                    arm.isChampion && "border-primary/50 bg-primary/5",
                    !arm.enabled && "opacity-50",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium capitalize">{arm.timeSlot}</span>
                    {arm.isChampion && <TrophyIcon className="size-3 text-primary" />}
                    <Badge variant="outline" className="ml-auto text-[10px] tabular-nums">
                      n={arm.observations}
                    </Badge>
                  </div>
                  <div className="mt-1 font-heading text-lg font-semibold tabular-nums">
                    {arm.mean.toFixed(2)}
                  </div>
                  <DensityStrip density={arm.density} highlight={arm.isChampion} />
                  <div className="mt-1 font-mono text-[10px] text-muted-foreground tabular-nums">
                    α {arm.alpha.toFixed(1)} · β {arm.beta.toFixed(1)}
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
