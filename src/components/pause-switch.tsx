"use client";

// Minimal client shim: the shadcn Switch is a controlled client primitive and
// cannot submit a <form> on toggle, so it invokes the bound server action directly.

import { useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function PauseSwitch({
  paused,
  toggleAction,
}: {
  paused: boolean;
  toggleAction: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <Switch
        id="pause-switch"
        checked={paused}
        disabled={pending}
        onCheckedChange={() => startTransition(() => toggleAction())}
      />
      <Label htmlFor="pause-switch" className="text-xs text-muted-foreground">
        {paused ? "Paused" : "Running"}
      </Label>
    </div>
  );
}
