"use client";

import type { ArmView } from "@/lib/db/queries";
import { cn } from "@/lib/utils";

/** Beta posterior as a filled area — a wide hump means "still uncertain". */
function DensityStrip({ density, highlight }: { density: number[]; highlight: boolean }) {
  const width = 100;
  const height = 22;
  const step = width / (density.length - 1);
  const points = density.map((d, i) => `${(i * step).toFixed(2)},${(height - d * height).toFixed(2)}`);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-5 w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <polygon
        points={`0,${height} ${points.join(" ")} ${width},${height}`}
        className={cn(highlight ? "fill-signal/20" : "fill-foreground/8")}
      />
      <polyline
        points={points.join(" ")}
        fill="none"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        className={cn(highlight ? "stroke-signal" : "stroke-foreground/35")}
      />
    </svg>
  );
}

export function ArmGrid({ arms }: { arms: ArmView[] }) {
  const archetypes = [...new Set(arms.map((a) => a.archetype))];

  return (
    <div>
      <p className="max-w-2xl px-6 py-5 text-[0.85rem] leading-relaxed text-muted-foreground md:px-10">
        Twelve arms — four archetypes across three time slots. Thompson sampling draws from each
        posterior and plays the winner, so a wide curve still gets explored.
      </p>

      {archetypes.map((archetype) => (
        <section key={archetype} className="border-t">
          <div className="border-b px-6 py-2.5 md:px-10">
            <h3 className="eyebrow">{archetype}</h3>
          </div>
          <div className="grid sm:grid-cols-3 [&>*]:-mr-px [&>*]:border-r [&>*]:border-b">
            {arms
              .filter((a) => a.archetype === archetype)
              .map((arm) => (
                <div
                  key={arm.id}
                  className={cn("px-6 py-4 md:px-10", !arm.enabled && "opacity-40")}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-[0.82rem]">{arm.timeSlot}</span>
                    <span className="font-mono text-[0.62rem] text-muted-foreground tabular-nums">
                      n={arm.observations}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span
                      className={cn("figure text-[1.75rem]", arm.isChampion && "text-signal")}
                    >
                      {arm.mean.toFixed(2)}
                    </span>
                    {arm.isChampion && <span className="eyebrow text-signal">champion</span>}
                  </div>
                  <div className="mt-2">
                    <DensityStrip density={arm.density} highlight={arm.isChampion} />
                  </div>
                  <div className="mt-1 font-mono text-[0.6rem] text-muted-foreground tabular-nums">
                    α {arm.alpha.toFixed(1)} · β {arm.beta.toFixed(1)}
                  </div>
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
