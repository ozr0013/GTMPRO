"use client";

import { useState } from "react";
import type {
  ArmView,
  CalibrationSeries,
  PlaybookView,
  PlaybookVersionView,
} from "@/lib/db/queries";
import { PlaybookPanel } from "./playbook-panel";
import { ArmGrid } from "./arm-grid";
import { CalibrationCharts } from "./calibration-charts";
import { cn } from "@/lib/utils";

type Tab = "playbook" | "bandits" | "calibration";

const TABS: { id: Tab; label: string; note: string }[] = [
  { id: "playbook", label: "Playbook", note: "what it believes" },
  { id: "bandits", label: "Bandits", note: "what it's testing" },
  { id: "calibration", label: "Calibration", note: "whether to trust it" },
];

/**
 * Tabs as three cards, each with an eyebrow and a bold title — the same
 * eyebrow / title / description rhythm the rest of the app uses.
 */
export function BrainView({
  worldId,
  playbook,
  history,
  arms,
  calibration,
}: {
  worldId: string;
  playbook: PlaybookView;
  history: PlaybookVersionView[];
  arms: ArmView[];
  calibration: CalibrationSeries;
}) {
  const [tab, setTab] = useState<Tab>("playbook");

  return (
    <div>
      <div role="tablist" aria-label="Brain views" className="mt-4 grid gap-4 sm:grid-cols-3">
        {TABS.map(({ id, label, note }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(id)}
              className={cn(
                "rounded-3xl px-6 py-5 text-left transition-colors",
                active ? "bg-foreground text-background" : "bg-card hover:bg-accent",
              )}
            >
              <span
                className={cn("eyebrow block", active && "text-background/60")}
              >
                {note}
              </span>
              <span className="display-sm mt-1.5 block text-[1.4rem]">{label}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="mt-4 overflow-hidden rounded-3xl bg-card">
        {tab === "playbook" && (
          <PlaybookPanel worldId={worldId} playbook={playbook} history={history} />
        )}
        {tab === "bandits" && <ArmGrid arms={arms} />}
        {tab === "calibration" && <CalibrationCharts series={calibration} />}
      </div>
    </div>
  );
}
