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
  { id: "playbook", label: "Playbook", note: "beliefs" },
  { id: "bandits", label: "Bandits", note: "experiments" },
  { id: "calibration", label: "Calibration", note: "trustworthiness" },
];

/**
 * Tabs as a ruled index rather than pills — each carries a subtitle so the three
 * views read as a claim about the agent's mind, not as generic navigation.
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
      <div
        role="tablist"
        aria-label="Brain views"
        className="grid border-b sm:grid-cols-3 [&>*]:-mr-px [&>*]:border-r"
      >
        {TABS.map(({ id, label, note }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(id)}
              className={cn(
                "group relative px-6 py-4 text-left transition-colors md:px-10",
                active ? "bg-muted/50" : "hover:bg-muted/30",
              )}
            >
              <span className={cn("display block text-[1.2rem]", active && "text-signal")}>
                {label}
              </span>
              <span className="eyebrow mt-1 block">{note}</span>
              {active && <span className="absolute inset-x-0 bottom-0 h-[2px] bg-signal" />}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {tab === "playbook" && (
          <PlaybookPanel worldId={worldId} playbook={playbook} history={history} />
        )}
        {tab === "bandits" && <ArmGrid arms={arms} />}
        {tab === "calibration" && <CalibrationCharts series={calibration} />}
      </div>
    </div>
  );
}
