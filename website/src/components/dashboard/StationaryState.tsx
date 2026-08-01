"use client";

import { useRaceStore } from "@/lib/store";
import { ModelName } from "@/components/dashboard/ProducerBadge";
import { StatusDot } from "@/components/ui/Readouts";

/**
 * What the Live view shows before anyone has driven.
 *
 * This is the honest resting state rather than an error: a phone sitting on a
 * table streams nothing worth interpreting, so there is nothing for the models
 * to say. Previously the view opened onto a race already in progress, which
 * read as live telemetry when no vehicle existed.
 *
 * The demo button is labelled as a demo on purpose. It starts the simulator,
 * not a car, and the label should not let anyone mistake one for the other.
 */
export function StationaryState() {
  const startDriving = useRaceStore((s) => s.startDriving);
  const trackName = useRaceStore((s) => s.meta?.trackName);

  return (
    <main className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-md border border-pit-border bg-pit-panel/80 p-6">
        <div className="flex items-center gap-2">
          {/* Amber, not green: present and connected, but not producing. */}
          <StatusDot level="warn" />
          <h1 className="text-[13px] tracking-[0.16em] text-ink uppercase">
            Car is stationary
          </h1>
        </div>

        <p className="mt-3 text-[14px] leading-relaxed text-ink-body">
          Insights will generate when the vehicle is running.
        </p>

        <p className="mt-3 text-[12px] leading-relaxed text-ink-secondary">
          The pit wall reads a live 10 Hz feed from the car. With the vehicle at
          rest there is no telemetry to interpret, so the rule engine, the
          signal patterns and the model all stay idle rather than reporting on a
          car that is not moving.
        </p>

        <div className="mt-3 flex items-center gap-2 border-t border-pit-border pt-3">
          <span className="text-[10px] tracking-[0.12em] text-ink-muted uppercase">
            Interpreter
          </span>
          <ModelName />
          <span className="text-[10px] text-ink-muted">idle</span>
        </div>

        <button
          onClick={startDriving}
          className="mt-5 w-full rounded border border-ink px-4 py-3 text-[12px] font-medium tracking-[0.16em] text-ink uppercase hover:bg-[#1c1c1c]"
        >
          Demo: start driving
        </button>

        <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
          Starts the simulator on{" "}
          <span className="text-ink-secondary">{trackName ?? "the default circuit"}</span>{" "}
          in place of a real car. Recorded runs are on the Replays tab and do
          not need this.
        </p>
      </div>
    </main>
  );
}
