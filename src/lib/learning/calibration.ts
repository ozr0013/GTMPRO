import { db } from "@/lib/db/client";
import { outcomeReports } from "@/lib/db/schema";
import type { PredictedEffect } from "@/lib/types";
import { eq, desc } from "drizzle-orm";

export type CalibrationMetric = "impressions" | "likes" | "linkClicks" | "signups";

export interface CalibrationPoint {
  tick: number;
  metric: CalibrationMetric;
  predictedMid: number;
  actual: number;
  withinRange: boolean;
}

const METRICS: CalibrationMetric[] = ["impressions", "likes", "linkClicks", "signups"];

function pointsFromReport(tick: number, actual: Record<string, number>, predicted: PredictedEffect): CalibrationPoint[] {
  return METRICS.map((metric) => {
    const range = predicted[metric];
    const lo = range[0];
    const hi = range[1];
    const val = actual[metric] ?? 0;
    return {
      tick,
      metric,
      predictedMid: (lo + hi) / 2,
      actual: val,
      withinRange: val >= lo && val <= hi,
    };
  });
}

export function calibrationSeries(worldId: string): CalibrationPoint[] {
  const reports = db
    .select()
    .from(outcomeReports)
    .where(eq(outcomeReports.worldId, worldId))
    .all()
    .sort((a, b) => a.tick - b.tick);
  const points: CalibrationPoint[] = [];
  for (const r of reports) {
    points.push(
      ...pointsFromReport(r.tick, r.actual as Record<string, number>, r.predicted as PredictedEffect),
    );
  }
  return points;
}

/** Fraction of actuals inside predicted ranges over the last `window` reports. Null if none. */
export function rollingHitRate(worldId: string, window = 10): number | null {
  const reports = db
    .select()
    .from(outcomeReports)
    .where(eq(outcomeReports.worldId, worldId))
    .orderBy(desc(outcomeReports.tick))
    .all()
    .slice(0, window);
  if (reports.length === 0) return null;
  let hits = 0;
  let total = 0;
  for (const r of reports) {
    for (const p of pointsFromReport(r.tick, r.actual as Record<string, number>, r.predicted as PredictedEffect)) {
      total += 1;
      if (p.withinRange) hits += 1;
    }
  }
  return hits / total;
}

export function calibrationNote(hitRate: number | null): string {
  if (hitRate === null) return "No calibration data yet. Predict honest ranges.";
  const pct = Math.round(hitRate * 100);
  if (hitRate < 0.5) {
    return `Your ranges are currently over-confident (hit-rate ${pct}%). Widen intervals.`;
  }
  if (hitRate > 0.8) {
    return `Your ranges are currently under-confident (hit-rate ${pct}%). Tighten intervals.`;
  }
  return `Calibration hit-rate ${pct}% — well calibrated.`;
}
