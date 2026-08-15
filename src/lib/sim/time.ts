// Pure sim-time helpers — no DB, no agents. Kept separate from clock.ts so client
// components can import them without dragging better-sqlite3 into the browser bundle.

export const TICKS_PER_DAY = 24;

/** `Day 3, 14:00` — the sim clock label used across Mission Control. */
export function formatSimTime(tick: number): string {
  const day = Math.floor(tick / TICKS_PER_DAY) + 1;
  const hour = tick % TICKS_PER_DAY;
  return `Day ${day}, ${String(hour).padStart(2, "0")}:00`;
}
