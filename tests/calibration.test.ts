import { describe, it, expect } from "vitest";
import { buildTinyWorld } from "./fixtures/world";
import { db } from "@/lib/db/client";
import { outcomeReports } from "@/lib/db/schema";
import { calibrationNote, calibrationSeries, rollingHitRate } from "@/lib/learning/calibration";
import { randomUUID } from "node:crypto";
import type { PredictedEffect } from "@/lib/types";

function insertReport(
  worldId: string,
  tick: number,
  actual: { impressions: number; likes: number; linkClicks: number; signups: number },
  predicted: PredictedEffect,
) {
  db.insert(outcomeReports)
    .values({
      id: randomUUID(),
      worldId,
      postId: randomUUID(),
      windowTicks: 24,
      actual,
      predicted,
      verdict: "met",
      attribution: [],
      summary: "seed",
      tick,
    })
    .run();
}

describe("calibration", () => {
  it("returns null hit-rate with no reports", () => {
    const { worldId } = buildTinyWorld("cal-empty");
    expect(rollingHitRate(worldId)).toBeNull();
    expect(calibrationSeries(worldId)).toEqual([]);
    expect(calibrationNote(null)).toMatch(/No calibration/);
  });

  it("marks actuals inside predicted ranges and computes hit-rate", () => {
    const { worldId } = buildTinyWorld("cal-hit");
    const predicted: PredictedEffect = {
      impressions: [10, 20],
      likes: [2, 6],
      linkClicks: [0, 2],
      signups: [0, 1],
    };
    insertReport(worldId, 24, { impressions: 15, likes: 4, linkClicks: 1, signups: 0 }, predicted);
    insertReport(worldId, 48, { impressions: 3, likes: 0, linkClicks: 9, signups: 5 }, predicted);

    const series = calibrationSeries(worldId);
    expect(series).toHaveLength(8);
    expect(series.filter((p) => p.tick === 24).every((p) => p.withinRange)).toBe(true);
    expect(series.filter((p) => p.tick === 48 && p.metric === "impressions")[0].withinRange).toBe(false);

    const rate = rollingHitRate(worldId, 10);
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThan(1);
    expect(calibrationNote(0.3)).toMatch(/over-confident/);
    expect(calibrationNote(0.9)).toMatch(/under-confident/);
    expect(calibrationNote(0.65)).toMatch(/well calibrated/);
  });
});
