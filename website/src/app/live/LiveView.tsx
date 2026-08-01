"use client";

import { useEffect } from "react";

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

/**
 * Whether this page load has already parked the car.
 *
 * Module scope, so it survives client-side navigation but not a reload. That
 * is the distinction we want: arriving at Live fresh always starts from
 * stationary, while stepping over to Replays and back leaves a race running.
 *
 * The driving flag lives on the server so every client agrees on it, which
 * also means it outlives the tab that set it — without this, a reload landed
 * straight in a race already in progress, which is the thing the stationary
 * state exists to prevent.
 */
let parkedThisLoad = false;

function LiveBody() {
  const driving = useRaceStore((s) => s.control.driving);
  const connection = useRaceStore((s) => s.connection);
  const stopDriving = useRaceStore((s) => s.stopDriving);

  useEffect(() => {
    // Wait for the socket: sending before it opens would be dropped, and the
    // page would land in a running race anyway.
    if (parkedThisLoad || connection !== "open") return;
    parkedThisLoad = true;
    stopDriving();
  }, [connection, stopDriving]);

  // Until the reset lands, hold the stationary state rather than flashing a
  // frame of the race that is about to be parked.
  if (!driving || !parkedThisLoad) return <StationaryState />;

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
