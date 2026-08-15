import { cookies } from "next/headers";
import { getWorld, getWorlds, type WorldSummary } from "@/lib/db/queries";

export const WORLD_COOKIE = "flywheel_world";

/**
 * Which world Mission Control is looking at. Cookie-backed rather than a route
 * param so every page keeps a clean URL and the switcher works from anywhere.
 * Reading the cookie also opts the whole app out of static rendering, which is
 * what we want — every view reflects live sim state.
 */
export async function getCurrentWorld(): Promise<WorldSummary | null> {
  const selected = (await cookies()).get(WORLD_COOKIE)?.value;
  if (selected) {
    const world = getWorld(selected);
    if (world) return world;
  }
  return getWorlds()[0] ?? null;
}
