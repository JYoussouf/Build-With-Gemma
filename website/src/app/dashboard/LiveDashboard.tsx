"use client";

import { CentreColumn } from "@/components/dashboard/CentreColumn";
import { EngineerPanel } from "@/components/dashboard/EngineerPanel";
import { LeftColumn } from "@/components/dashboard/LeftColumn";
import { TimingTower } from "@/components/dashboard/TimingTower";
import { TopBar } from "@/components/dashboard/TopBar";
import { useRaceClock } from "@/lib/store";

/**
 * View 4 — Live Race Dashboard (docs/website-dashboard.md).
 * Three permanent columns: track & car, telemetry & strategy, engineer panel.
 * The engineer column never scrolls away from a pending anomaly.
 */
export function LiveDashboard() {
  useRaceClock();

  return (
    <div className="flex h-dvh flex-col">
      <TopBar />

      <main className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[minmax(0,30fr)_minmax(0,40fr)_minmax(0,30fr)]">
        <LeftColumn />
        <div className="flex min-h-0 flex-col gap-3">
          <div className="min-h-0 flex-1 overflow-hidden">
            <CentreColumn />
          </div>
          <div className="h-[240px] shrink-0">
            <TimingTower />
          </div>
        </div>
        <EngineerPanel />
      </main>
    </div>
  );
}
