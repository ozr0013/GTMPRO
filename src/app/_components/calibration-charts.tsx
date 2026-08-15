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

const AXIS = { fontSize: 11, fill: "var(--muted-foreground)" };

export function CalibrationCharts({ series }: { series: CalibrationSeries }) {
  if (series.points.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No outcome reports yet. Publish a post and advance a full sim day so the analyst can score it.
      </p>
    );
  }

  const max = Math.max(...series.points.flatMap((p) => [p.predicted, p.actual]), 1);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-heading text-sm font-medium">Rolling hit rate</h3>
        <p className="mb-2 text-xs text-muted-foreground">
          Share of metrics landing inside the strategist&apos;s predicted range — overall{" "}
          <span className="font-medium tabular-nums">{(series.overallHitRate * 100).toFixed(0)}%</span>.
        </p>
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series.rolling} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
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
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="hitRate"
                stroke="var(--chart-2)"
                strokeWidth={2}
                dot={{ r: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h3 className="font-heading text-sm font-medium">Predicted vs actual</h3>
        <p className="mb-2 text-xs text-muted-foreground">
          Points on the diagonal are perfectly calibrated; above it the agent under-promised, below
          it over-promised.
        </p>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
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
              <ZAxis range={[40, 40]} />
              <ReferenceLine
                segment={[
                  { x: 0, y: 0 },
                  { x: max, y: max },
                ]}
                stroke="var(--muted-foreground)"
                strokeDasharray="4 4"
              />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Scatter
                name="hit"
                data={series.points.filter((p) => p.hit)}
                fill="var(--chart-2)"
              />
              <Scatter
                name="miss"
                data={series.points.filter((p) => !p.hit)}
                fill="var(--destructive)"
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
