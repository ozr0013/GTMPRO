"use client";

import type {
  ArmView,
  CalibrationSeries,
  PlaybookView,
  PlaybookVersionView,
} from "@/lib/db/queries";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlaybookPanel } from "./playbook-panel";
import { ArmGrid } from "./arm-grid";
import { CalibrationCharts } from "./calibration-charts";

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
  return (
    <Tabs defaultValue="playbook">
      <TabsList>
        <TabsTrigger value="playbook">Playbook</TabsTrigger>
        <TabsTrigger value="bandits">Bandits</TabsTrigger>
        <TabsTrigger value="calibration">Calibration</TabsTrigger>
      </TabsList>

      <TabsContent value="playbook" className="pt-4">
        <PlaybookPanel worldId={worldId} playbook={playbook} history={history} />
      </TabsContent>
      <TabsContent value="bandits" className="pt-4">
        <ArmGrid arms={arms} />
      </TabsContent>
      <TabsContent value="calibration" className="pt-4">
        <CalibrationCharts series={calibration} />
      </TabsContent>
    </Tabs>
  );
}
