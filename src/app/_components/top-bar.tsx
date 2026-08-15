"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WorldSummary } from "@/lib/db/queries";
import {
  advanceTicksAction,
  heartbeatAction,
  selectWorldAction,
  setModeAction,
  togglePauseAction,
} from "@/app/actions";
import { Switch } from "@/components/ui/switch";
import { TICKS_PER_DAY } from "@/lib/sim/time";

const JUMPS = [
  { label: "+1h", ticks: 1 },
  { label: "+6h", ticks: 6 },
  { label: "+1 day", ticks: TICKS_PER_DAY },
] as const;

function Readout({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="shrink-0">
      <div className="eyebrow">{label}</div>
      <div
        className={`mt-1 font-mono text-[0.85rem] tabular-nums ${accent ? "font-bold" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

/** Control deck: a white pill card holding the sim clock, autonomy and time jumps. */
export function TopBar({ world, worlds }: { world: WorldSummary; worlds: WorldSummary[] }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  return (
    <div className="px-4 pt-4 md:px-8">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-3xl bg-card px-6 py-4">
        {worlds.length > 1 ? (
          <select
            aria-label="Switch world"
            value={world.id}
            onChange={(e) => run(() => selectWorldAction(e.target.value))}
            className="display-sm max-w-52 shrink-0 truncate border-none bg-transparent pr-6 text-[1.25rem] outline-none"
          >
            {worlds.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="display-sm shrink-0 text-[1.25rem]">{world.name}</span>
        )}

        <Readout label="Sim clock" value={world.simLabel} accent />
        <Readout label="Playbook" value={`v${world.playbookVersion}`} />
        <Readout label="Followers" value={String(world.followers)} />
        <Readout
          label="Mode"
          value={world.paused ? "HALTED" : world.mode === "autopilot" ? "AUTO" : "PROPOSE"}
        />
        {world.earnedAutonomy && !world.paused && world.mode === "propose" && (
          <span
            className="shrink-0 rounded-full bg-foreground px-3 py-1.5 font-mono text-[0.65rem] font-bold tracking-wider text-background uppercase"
            title={`Calibration hit-rate ${Math.round((world.earnedAutonomyHitRate ?? 0) * 100)}% over the last 5 scored posts — low-risk actions auto-approve; sensitive actions stay human-gated`}
          >
            earned autonomy
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-3">
          <label className="flex items-center gap-2">
            <Switch
              size="sm"
              checked={world.mode === "autopilot"}
              disabled={pending}
              onCheckedChange={(checked) =>
                run(() => setModeAction(world.id, checked ? "autopilot" : "propose"))
              }
            />
            <span className="eyebrow">Autopilot</span>
          </label>

          {/* kill switch — paused blocks the heartbeat outright */}
          <label className="flex items-center gap-2">
            <Switch
              size="sm"
              checked={world.paused}
              disabled={pending}
              onCheckedChange={() => run(() => togglePauseAction(world.id))}
            />
            <span className="eyebrow">Halt</span>
          </label>

          <button
            type="button"
            disabled={pending || world.paused}
            onClick={() => run(() => heartbeatAction(world.id))}
            className="rounded-full bg-foreground px-5 py-2.5 text-[0.7rem] font-bold tracking-widest text-background uppercase transition-opacity hover:opacity-80 disabled:opacity-30"
          >
            {pending ? "Running…" : "Run heartbeat"}
          </button>

          <div className="flex items-center gap-1.5 rounded-full bg-muted p-1">
            {JUMPS.map(({ label, ticks }) => (
              <button
                key={label}
                type="button"
                disabled={pending}
                onClick={() => run(() => advanceTicksAction(world.id, ticks))}
                className="rounded-full px-3 py-1.5 font-mono text-[0.7rem] transition-colors hover:bg-card disabled:opacity-40"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
