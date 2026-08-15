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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ClockIcon, HeartPulseIcon, Loader2Icon } from "lucide-react";
import { TICKS_PER_DAY } from "@/lib/sim/time";

const JUMPS = [
  { label: "+1h", ticks: 1 },
  { label: "+6h", ticks: 6 },
  { label: "+1 day", ticks: TICKS_PER_DAY },
] as const;

export function TopBar({ world, worlds }: { world: WorldSummary; worlds: WorldSummary[] }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  return (
    <header className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
      {worlds.length > 1 ? (
        <select
          aria-label="Switch world"
          value={world.id}
          onChange={(e) => run(() => selectWorldAction(e.target.value))}
          className="h-8 rounded-lg border bg-background px-2 text-sm font-medium"
        >
          {worlds.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      ) : (
        <span className="font-heading text-sm font-medium">{world.name}</span>
      )}

      <Separator orientation="vertical" className="h-5" />

      <span className="flex items-center gap-1.5 font-mono text-sm text-muted-foreground">
        <ClockIcon className="size-3.5" />
        {world.simLabel}
      </span>

      <Badge variant={world.mode === "autopilot" ? "default" : "secondary"}>
        {world.mode === "autopilot" ? "Autopilot" : "Propose"}
      </Badge>
      <Badge variant="outline">Playbook v{world.playbookVersion}</Badge>
      <Badge variant="outline">{world.followers} followers</Badge>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Autopilot
          <Switch
            checked={world.mode === "autopilot"}
            disabled={pending}
            onCheckedChange={(checked) =>
              run(() => setModeAction(world.id, checked ? "autopilot" : "propose"))
            }
          />
        </label>

        {/* kill switch — paused blocks the heartbeat outright */}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Paused
          <Switch
            checked={world.paused}
            disabled={pending}
            onCheckedChange={() => run(() => togglePauseAction(world.id))}
          />
        </label>

        <Separator orientation="vertical" className="h-5" />

        <Button
          size="sm"
          variant="secondary"
          disabled={pending || world.paused}
          onClick={() => run(() => heartbeatAction(world.id))}
        >
          {pending ? <Loader2Icon className="animate-spin" /> : <HeartPulseIcon />}
          Run heartbeat
        </Button>

        {JUMPS.map(({ label, ticks }) => (
          <Button
            key={label}
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => advanceTicksAction(world.id, ticks))}
          >
            {label}
          </Button>
        ))}
      </div>
    </header>
  );
}
