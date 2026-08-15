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
import { cn } from "@/lib/utils";
import { TICKS_PER_DAY } from "@/lib/sim/time";

const JUMPS = [
  { label: "+1h", ticks: 1 },
  { label: "+6h", ticks: 6 },
  { label: "+1d", ticks: TICKS_PER_DAY },
] as const;

/** Masthead readout: label above value, hairline-separated. */
function Readout({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-5 py-2.5", className)}>
      <div className="eyebrow">{label}</div>
      <div className="mt-0.5 font-mono text-[0.82rem] tabular-nums">{children}</div>
    </div>
  );
}

export function TopBar({ world, worlds }: { world: WorldSummary; worlds: WorldSummary[] }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  return (
    <header className="border-b">
      <div className="flex flex-wrap items-stretch divide-x">
        <div className="flex min-w-0 flex-1 items-center px-5 py-2.5">
          {worlds.length > 1 ? (
            <select
              aria-label="Switch world"
              value={world.id}
              onChange={(e) => run(() => selectWorldAction(e.target.value))}
              className="display -ml-0.5 max-w-full truncate border-none bg-transparent pr-5 text-[1.35rem] outline-none"
            >
              {worlds.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="display truncate text-[1.35rem]">{world.name}</span>
          )}
        </div>

        <Readout label="Sim clock">
          {/* the clock is the instrument's heartbeat — give it the accent */}
          <span className="text-signal">{world.simLabel}</span>
        </Readout>
        <Readout label="Playbook" className="hidden sm:block">
          v{world.playbookVersion}
        </Readout>
        <Readout label="Followers" className="hidden sm:block">
          {world.followers}
        </Readout>
        <Readout label="Mode" className="hidden md:block">
          <span className={world.paused ? "text-destructive" : undefined}>
            {world.paused ? "PAUSED" : world.mode === "autopilot" ? "AUTO" : "PROPOSE"}
          </span>
        </Readout>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t px-5 py-2">
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

        <div className="ml-auto flex items-center gap-5">
          <button
            type="button"
            disabled={pending || world.paused}
            onClick={() => run(() => heartbeatAction(world.id))}
            className="eyebrow border-b border-signal pb-0.5 text-signal transition-opacity hover:opacity-60 disabled:pointer-events-none disabled:opacity-30"
          >
            {pending ? "Running…" : "Run heartbeat"}
          </button>

          <div className="flex items-center gap-1">
            <span className="eyebrow mr-1">Advance</span>
            {JUMPS.map(({ label, ticks }) => (
              <button
                key={label}
                type="button"
                disabled={pending}
                onClick={() => run(() => advanceTicksAction(world.id, ticks))}
                className="border px-2 py-1 font-mono text-[0.7rem] transition-colors hover:bg-foreground hover:text-background disabled:pointer-events-none disabled:opacity-40"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
