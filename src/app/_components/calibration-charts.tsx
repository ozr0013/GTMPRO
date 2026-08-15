"use client";

import type { CalibrationSeries } from "@/lib/db/queries";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

const AXIS = {
  fontSize: 10,
  fill: "var(--muted-foreground)",
  fontFamily: "var(--font-mono)",
};

const TOOLTIP = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 2,
  fontSize: 11,
  fontFamily: "var(--font-mono)",
};

export function CalibrationCharts({ series }: { series: CalibrationSeries }) {
  if (series.points.length === 0) {
    return (
      <p className="px-6 py-10 text-[0.85rem] text-muted-foreground md:px-10">
        No outcome reports yet. Publish a post and advance a full sim day so the analyst can
        score it.
      </p>
    );
  }

  const max = Math.max(...series.points.flatMap((p) => [p.predicted, p.actual]), 1);
  const hits = series.points.filter((p) => p.hit).length;

  return (
    <div>
      {/* the headline number gets the display treatment */}
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3 border-b px-6 py-6 md:px-10">
        <div>
          <p className="eyebrow">Overall hit rate</p>
          <p className="figure mt-1.5 text-[2.75rem]">
            {(series.overallHitRate * 100).toFixed(0)}%
          </p>
        </div>
        <p className="max-w-md text-[0.85rem] leading-relaxed text-muted-foreground">
          {hits} of {series.points.length} metrics landed inside the strategist&apos;s predicted
          range. A confident agent that misses its own ranges is worth less than a cautious one
          that hits them.
        </p>
      </div>

      <section className="border-b">
        <div className="border-b px-6 py-2.5 md:px-10">
          <h3 className="eyebrow">Rolling hit rate</h3>
        </div>
        <div className="h-56 w-full px-4 py-4 md:px-8">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series.rolling} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
              <YAxis
                domain={[0, 1]}
                tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                tick={AXIS}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(v) => [`${(Number(v) * 100).toFixed(0)}%`, "hit rate"]}
                contentStyle={TOOLTIP}
              />
              <Line
                type="monotone"
                dataKey="hitRate"
                stroke="var(--foreground)"
                strokeWidth={1.5}
                dot={{ r: 2, fill: "var(--foreground)", strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between border-b px-6 py-2.5 md:px-10">
          <h3 className="eyebrow">Predicted vs actual</h3>
          <span className="text-[0.72rem] text-muted-foreground">
            above the diagonal = under-promised
          </span>
        </div>
        <div className="h-72 w-full px-4 py-4 md:px-8">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
              <CartesianGrid stroke="var(--border)" />
              <XAxis
                type="number"
                dataKey="predicted"
                name="predicted"
                domain={[0, max]}
                tick={AXIS}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="number"
                dataKey="actual"
                name="actual"
                domain={[0, max]}
                tick={AXIS}
                tickLine={false}
                axisLine={false}
              />
              <ZAxis range={[36, 36]} />
              <ReferenceLine
                segment={[
                  { x: 0, y: 0 },
                  { x: max, y: max },
                ]}
                stroke="var(--muted-foreground)"
                strokeDasharray="3 3"
              />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={TOOLTIP} />
              {/* hits are solid ink, misses hollow grey — value, not hue */}
              <Scatter
                name="hit"
                data={series.points.filter((p) => p.hit)}
                fill="var(--foreground)"
              />
              <Scatter
                name="miss"
                data={series.points.filter((p) => !p.hit)}
                fill="var(--muted-foreground)"
                fillOpacity={0.45}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
