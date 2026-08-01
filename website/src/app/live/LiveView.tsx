"use client";

import { CentreColumn } from "@/components/dashboard/CentreColumn";
import { EngineerPanel } from "@/components/dashboard/EngineerPanel";
import { LeftColumn } from "@/components/dashboard/LeftColumn";
import { StationaryState } from "@/components/dashboard/StationaryState";
import { TimingTower } from "@/components/dashboard/TimingTower";
import { TopBar } from "@/components/dashboard/TopBar";
import { RaceGate } from "@/components/RaceGate";
import { useRaceStore } from "@/lib/store";

/**
 * Live — the pit wall against a running vehicle.
 *
 * Holds the stationary state until someone drives, so the view never shows a
 * race in progress when no car is moving. Recorded runs live on Replays.
 */
export function LiveView() {
  return (
    <RaceGate>
      <LiveBody />
    </RaceGate>
  );
}

function LiveBody() {
  const driving = useRaceStore((s) => s.control.driving);

  if (!driving) return <StationaryState />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar />

      <main className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[minmax(0,30fr)_minmax(0,40fr)_minmax(0,30fr)]">
        <LeftColumn />
        <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-3">
          <div className="min-h-0">
            <CentreColumn />
          </div>
          <div className="h-[190px] shrink-0 xl:h-[230px]">
            <TimingTower />
          </div>
        </div>
        <EngineerPanel />
      </main>
    </div>
  );
}
